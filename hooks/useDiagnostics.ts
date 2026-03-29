import { useMemo } from 'react';
import type {
  Block,
  RenpyAnalysisResult,
  ProjectImage,
  RenpyAudio,
  ImageMetadata,
  AudioMetadata,
  DiagnosticIssue,
  DiagnosticsResult,
  DiagnosticsTask,
  PunchlistMetadata,
} from '../types';
import { validateRenpyCode } from '../lib/renpyValidator';

// ---------------------------------------------------------------------------
// Ren'Py statement keywords — these should not be treated as character names
// ---------------------------------------------------------------------------
const STATEMENT_KEYWORDS = new Set([
  'show', 'hide', 'scene', 'play', 'queue', 'stop', 'pause', 'with', 'window',
  'define', 'default', 'init', 'label', 'jump', 'call', 'return', 'if', 'elif',
  'else', 'for', 'while', 'pass', 'menu', 'image', 'transform', 'style', 'screen',
  'python', 'translate', 'nvl', 'voice', 'renpy', 'config', 'gui', 'at', 'as',
  'behind', 'onlayer', 'zorder', 'expression', 'extend', 'camera',
]);

// Regex for character dialogue lines: indented <tag> "<text>"
const RE_CHAR_DIALOGUE = /^\s+([a-zA-Z_]\w*)\s+"/;
// Regex for show/scene statement + screen reference
const RE_SCREEN_REF = /^\s*(?:call|show|hide)\s+screen\s+([a-zA-Z_]\w*)/;

// ---------------------------------------------------------------------------
// Main hook
// ---------------------------------------------------------------------------

export function useDiagnostics(
  blocks: Block[],
  analysisResult: RenpyAnalysisResult,
  projectImages: Map<string, ProjectImage>,
  imageMetadata: Map<string, ImageMetadata>,
  projectAudios: Map<string, RenpyAudio>,
  audioMetadata: Map<string, AudioMetadata>,
): DiagnosticsResult {
  // Build image and audio lookup sets (same logic as PunchlistManager)
  const existingImageTags = useMemo(() => {
    const tags = new Set<string>();
    analysisResult.definedImages.forEach(t => tags.add(t));
    projectImages.forEach(img => {
      const meta = imageMetadata.get(img.projectFilePath || img.filePath);
      const name = meta?.renpyName || img.fileName.split('.').slice(0, -1).join('.');
      const t = (meta?.tags || []).join(' ');
      const fullTag = `${name} ${t}`.trim().replace(/\s+/g, ' ');
      tags.add(fullTag);
      tags.add(name);
    });
    return tags;
  }, [analysisResult.definedImages, projectImages, imageMetadata]);

  const existingAudioPaths = useMemo(() => {
    const paths = new Set<string>();
    projectAudios.forEach(aud => {
      paths.add(aud.fileName);
      if (aud.projectFilePath) paths.add(aud.projectFilePath.replace(/\\/g, '/'));
      if (aud.filePath) paths.add(aud.filePath.replace(/\\/g, '/'));
      paths.add(aud.fileName.split('.').slice(0, -1).join('.'));
    });
    return paths;
  }, [projectAudios]);

  return useMemo(() => {
    const issues: DiagnosticIssue[] = [];

    // -----------------------------------------------------------------------
    // Source 1: Invalid jump/call targets
    // -----------------------------------------------------------------------
    for (const [blockId, targets] of Object.entries(analysisResult.invalidJumps)) {
      const block = blocks.find(b => b.id === blockId);
      for (const target of targets) {
        // Find line number from analysisResult.jumps
        const jump = analysisResult.jumps[blockId]?.find(j => j.target === target);
        issues.push({
          id: `invalid-jump:${blockId}:${target}`,
          severity: 'error',
          category: 'invalid-jump',
          message: `Undefined label "${target}"`,
          blockId,
          filePath: block?.filePath,
          line: jump?.line,
          column: jump?.columnStart,
        });
      }
    }

    // -----------------------------------------------------------------------
    // Source 2: Syntax validation on ALL blocks
    // -----------------------------------------------------------------------
    for (const block of blocks) {
      if (!block.content) continue;
      const diags = validateRenpyCode(block.content);
      for (const d of diags) {
        issues.push({
          id: `syntax:${block.id}:${d.startLineNumber}:${d.startColumn}`,
          severity: d.severity,
          category: 'syntax',
          message: d.message,
          blockId: block.id,
          filePath: block.filePath,
          line: d.startLineNumber,
          column: d.startColumn,
        });
      }
    }

    // -----------------------------------------------------------------------
    // Source 3 & 4: Missing images and audio (ported from PunchlistManager)
    // We track by asset name so each unique missing asset appears once
    // -----------------------------------------------------------------------
    const seenImages = new Set<string>();
    const seenAudio = new Set<string>();

    for (const block of blocks) {
      if (!block.content) continue;
      const lines = block.content.split('\n');
      lines.forEach((line, index) => {
        // Missing images
        const showMatch = line.match(/^\s*(?:show|scene)\s+([a-zA-Z0-9_ ]+)/);
        if (showMatch) {
          const rawTag = showMatch[1].trim();
          if (!['expression', 'layer', 'screen'].includes(rawTag.split(' ')[0])) {
            let isDefined = existingImageTags.has(rawTag);
            if (!isDefined) {
              const parts = rawTag.split(' ');
              for (let i = 1; i <= parts.length; i++) {
                if (existingImageTags.has(parts.slice(0, i).join(' '))) {
                  isDefined = true;
                  break;
                }
              }
            }
            if (!isDefined && !seenImages.has(rawTag)) {
              seenImages.add(rawTag);
              issues.push({
                id: `missing-image:${rawTag}`,
                severity: 'warning',
                category: 'missing-image',
                message: `Image "${rawTag}" not found in assets or definitions`,
                blockId: block.id,
                filePath: block.filePath,
                line: index + 1,
              });
            }
          }
        }

        // Missing audio
        const audioMatch = line.match(/^\s*(?:play|queue)\s+\w+\s+(.+)/);
        if (audioMatch) {
          const content = audioMatch[1].trim();
          const quotedMatch = content.match(/^["']([^"']+)["']/);
          let targetName = '';
          let isDefined = false;

          if (quotedMatch) {
            targetName = quotedMatch[1];
            for (const path of existingAudioPaths) {
              if (path.endsWith(targetName) || targetName.endsWith(path)) {
                isDefined = true;
                break;
              }
            }
          } else {
            const firstToken = content.split(/\s+/)[0];
            if (firstToken !== 'expression') {
              targetName = firstToken;
              if (existingAudioPaths.has(targetName) || analysisResult.variables.has(targetName)) {
                isDefined = true;
              }
            }
          }

          if (targetName && !isDefined && !seenAudio.has(targetName)) {
            seenAudio.add(targetName);
            issues.push({
              id: `missing-audio:${targetName}`,
              severity: 'warning',
              category: 'missing-audio',
              message: `Audio "${targetName}" not found in assets or variables`,
              blockId: block.id,
              filePath: block.filePath,
              line: index + 1,
            });
          }
        }
      });
    }

    // -----------------------------------------------------------------------
    // Source 5: Undefined characters in dialogue
    // -----------------------------------------------------------------------
    const seenUndefinedChars = new Set<string>();
    for (const block of blocks) {
      if (!block.content) continue;
      const lines = block.content.split('\n');
      lines.forEach((line, index) => {
        const m = RE_CHAR_DIALOGUE.exec(line);
        if (m) {
          const tag = m[1];
          if (!STATEMENT_KEYWORDS.has(tag) && !analysisResult.characters.has(tag) && !seenUndefinedChars.has(tag)) {
            seenUndefinedChars.add(tag);
            issues.push({
              id: `undefined-character:${tag}`,
              severity: 'warning',
              category: 'undefined-character',
              message: `Character "${tag}" used in dialogue but never defined`,
              blockId: block.id,
              filePath: block.filePath,
              line: index + 1,
            });
          }
        }
      });
    }

    // -----------------------------------------------------------------------
    // Source 6: Undefined screens
    // -----------------------------------------------------------------------
    const seenUndefinedScreens = new Set<string>();
    for (const block of blocks) {
      if (!block.content) continue;
      const lines = block.content.split('\n');
      lines.forEach((line, index) => {
        const m = RE_SCREEN_REF.exec(line);
        if (m) {
          const name = m[1];
          if (!analysisResult.screens.has(name) && !seenUndefinedScreens.has(name)) {
            seenUndefinedScreens.add(name);
            issues.push({
              id: `undefined-screen:${name}`,
              severity: 'warning',
              category: 'undefined-screen',
              message: `Screen "${name}" referenced but never defined`,
              blockId: block.id,
              filePath: block.filePath,
              line: index + 1,
            });
          }
        }
      });
    }

    // -----------------------------------------------------------------------
    // Source 7: Unused characters (defined but zero dialogue usage)
    // -----------------------------------------------------------------------
    analysisResult.characters.forEach((char) => {
      const count = analysisResult.characterUsage.get(char.tag) ?? 0;
      if (count === 0) {
        const block = blocks.find(b => b.id === char.definedInBlockId);
        issues.push({
          id: `unused-character:${char.tag}`,
          severity: 'info',
          category: 'unused-character',
          message: `Character "${char.tag}" (${char.name}) is defined but never used in dialogue`,
          blockId: char.definedInBlockId,
          filePath: block?.filePath,
        });
      }
    });

    // -----------------------------------------------------------------------
    // Source 8: Unreachable labels
    // A label is unreachable if it is never the target of any jump/call and
    // it is not "start" or any conventional entry point.
    // -----------------------------------------------------------------------
    const allJumpTargets = new Set<string>();
    for (const jumpList of Object.values(analysisResult.jumps)) {
      for (const jump of jumpList) {
        allJumpTargets.add(jump.target);
      }
    }

    for (const [labelName, labelLoc] of Object.entries(analysisResult.labels)) {
      // Skip conventional entry points
      if (labelName === 'start' || labelName === 'quit' || labelName === 'after_load' ||
          labelName === 'splashscreen' || labelName === 'main_menu' ||
          labelName.startsWith('_')) continue;

      if (!allJumpTargets.has(labelName)) {
        const block = blocks.find(b => b.id === (labelLoc as { blockId?: string }).blockId);
        issues.push({
          id: `unreachable-label:${labelName}`,
          severity: 'info',
          category: 'unreachable-label',
          message: `Label "${labelName}" is never reached by any jump or call`,
          blockId: (labelLoc as { blockId?: string }).blockId,
          filePath: block?.filePath,
          line: (labelLoc as { line?: number }).line,
        });
      }
    }

    // -----------------------------------------------------------------------
    // Compute counts
    // -----------------------------------------------------------------------
    let errorCount = 0;
    let warningCount = 0;
    let infoCount = 0;
    for (const issue of issues) {
      if (issue.severity === 'error') errorCount++;
      else if (issue.severity === 'warning') warningCount++;
      else infoCount++;
    }

    return { issues, errorCount, warningCount, infoCount };
  }, [
    blocks,
    analysisResult,
    existingImageTags,
    existingAudioPaths,
  ]);
}

// ---------------------------------------------------------------------------
// Migration: punchlistMetadata → DiagnosticsTask[]
// Only sticky note entries are migrated as tasks; image/audio entries become
// auto-detected Issues and are intentionally dropped.
// ---------------------------------------------------------------------------
export function migratePunchlistToTasks(
  metadata: Record<string, PunchlistMetadata>,
): DiagnosticsTask[] {
  const tasks: DiagnosticsTask[] = [];
  for (const [id, meta] of Object.entries(metadata)) {
    if (id.startsWith('note:')) {
      const stickyNoteId = id.substring(5);
      tasks.push({
        id: crypto.randomUUID(),
        title: `Canvas note: ${stickyNoteId}`,
        description: meta.notes || '',
        status: meta.status === 'completed' ? 'completed' : 'open',
        stickyNoteId,
        createdAt: Date.now(),
      });
    }
  }
  return tasks;
}
