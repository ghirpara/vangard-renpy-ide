import React, { useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid,
} from 'recharts';
import type { Block, RenpyAnalysisResult, LabelNode, RouteLink, IdentifiedRoute } from '../types';

interface StatsViewProps {
  blocks: Block[];
  analysisResult: RenpyAnalysisResult;
  routeAnalysisResult: { labelNodes: LabelNode[]; routeLinks: RouteLink[]; identifiedRoutes: IdentifiedRoute[] };
  imageCount: number;
  audioCount: number;
  diagnosticsErrorCount: number;
  onOpenDiagnostics: () => void;
}

function countWordsInScript(script: string): number {
  if (!script) return 0;
  const DIALOGUE_NARRATION_REGEX = /(?:[a-zA-Z0-9_]+\s)?"((?:\\.|[^"\\])*)"/g;
  let total = 0;
  let match;
  while ((match = DIALOGUE_NARRATION_REGEX.exec(script)) !== null) {
    const text = match[1];
    if (text) total += text.trim().split(/\s+/).filter(Boolean).length;
  }
  return total;
}

// ── Complexity ────────────────────────────────────────────────────────────────

type ComplexityBucket = 'Linear' | 'Branching' | 'Complex' | 'Non-linear';

function getComplexityBucket(branchingCount: number, totalBlocks: number, routeCount: number): ComplexityBucket {
  const ratio = branchingCount / Math.max(1, totalBlocks);
  if (ratio > 0.5 || routeCount > 30) return 'Non-linear';
  if (ratio > 0.25 || routeCount > 12) return 'Complex';
  if (ratio > 0.08 || routeCount > 3) return 'Branching';
  return 'Linear';
}

const COMPLEXITY_COLORS: Record<ComplexityBucket, string> = {
  Linear: '#22c55e',
  Branching: '#6366f1',
  Complex: '#f59e0b',
  'Non-linear': '#ef4444',
};

const COMPLEXITY_DESCRIPTIONS: Record<ComplexityBucket, string> = {
  Linear: 'Mainly one path through the story',
  Branching: 'Several distinct story paths',
  Complex: 'Many intersecting routes and choices',
  'Non-linear': 'Highly interconnected — large route space',
};

// ── Shared components ─────────────────────────────────────────────────────────

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h2 className="text-xs font-semibold text-secondary uppercase tracking-widest mb-3">{children}</h2>
);

const StatCard: React.FC<{
  label: string;
  value: React.ReactNode;
  sub?: string;
  onClick?: () => void;
}> = ({ label, value, sub, onClick }) => (
  <div
    className={`bg-secondary rounded-lg p-4 flex flex-col gap-1 ${onClick ? 'cursor-pointer hover:ring-1 hover:ring-indigo-400 transition-shadow' : ''}`}
    onClick={onClick}
    role={onClick ? 'button' : undefined}
    tabIndex={onClick ? 0 : undefined}
    onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); } : undefined}
  >
    <span className="text-xs font-semibold text-secondary uppercase tracking-wide">{label}</span>
    <span className="text-2xl font-bold text-primary">{value}</span>
    {sub && <span className="text-xs text-secondary">{sub}</span>}
  </div>
);

// ── Character table (used when > 6 characters) ────────────────────────────────

type SortKey = 'name' | 'words';
type SortDir = 'asc' | 'desc';

const CharacterTable: React.FC<{
  data: { name: string; words: number; color: string }[];
}> = ({ data }) => {
  const [sortKey, setSortKey] = useState<SortKey>('words');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const totalDialogue = useMemo(() => data.reduce((s, d) => s + d.words, 0), [data]);

  const sorted = useMemo(() => {
    return [...data].sort((a, b) => {
      const mul = sortDir === 'asc' ? 1 : -1;
      if (sortKey === 'name') return mul * a.name.localeCompare(b.name);
      return mul * (a.words - b.words);
    });
  }, [data, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  };

  const SortIcon: React.FC<{ col: SortKey }> = ({ col }) => (
    <span className={`ml-1 ${sortKey === col ? 'text-primary' : 'text-secondary opacity-40'}`}>
      {sortKey === col ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
    </span>
  );

  return (
    <div className="overflow-x-auto rounded-lg border border-primary">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-tertiary border-b border-primary text-secondary text-xs">
            <th className="px-3 py-2 w-8" />
            <th
              className="px-3 py-2 text-left font-semibold cursor-pointer select-none"
              onClick={() => toggleSort('name')}
            >
              Character <SortIcon col="name" />
            </th>
            <th
              className="px-3 py-2 text-right font-semibold cursor-pointer select-none"
              onClick={() => toggleSort('words')}
            >
              Words <SortIcon col="words" />
            </th>
            <th className="px-3 py-2 pr-4 text-right font-semibold">Share</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => {
            const share = totalDialogue > 0 ? (row.words / totalDialogue) * 100 : 0;
            return (
              <tr key={row.name} className={`border-b border-primary last:border-0 ${i % 2 === 1 ? 'bg-secondary/20' : ''}`}>
                <td className="px-3 py-2">
                  <span
                    className="inline-block w-3 h-3 rounded-full"
                    style={{ backgroundColor: row.color }}
                  />
                </td>
                <td className="px-3 py-2 font-medium text-primary">{row.name}</td>
                <td className="px-3 py-2 text-right tabular-nums text-secondary">
                  {row.words.toLocaleString()}
                </td>
                <td className="px-3 py-2 pr-4">
                  <div className="flex items-center justify-end gap-2">
                    <div className="w-20 h-1.5 bg-tertiary rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${share}%`, backgroundColor: row.color }}
                      />
                    </div>
                    <span className="tabular-nums text-secondary text-xs w-10 text-right">
                      {share.toFixed(1)}%
                    </span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

// ── File limit toggle ─────────────────────────────────────────────────────────

const FILE_LIMITS = [15, 30, 'all'] as const;
type FileLimit = typeof FILE_LIMITS[number];

const CHAR_LIMITS = [5, 15, 'all'] as const;
type CharLimit = typeof CHAR_LIMITS[number];

// ── Main component ────────────────────────────────────────────────────────────

const StatsView: React.FC<StatsViewProps> = ({
  blocks,
  analysisResult,
  routeAnalysisResult,
  imageCount,
  audioCount,
  diagnosticsErrorCount,
  onOpenDiagnostics,
}) => {
  const [fileLimit, setFileLimit] = useState<FileLimit>(15);
  const [charLimit, setCharLimit] = useState<CharLimit>(5);

  const { branchingBlockIds, labels, characters, dialogueLines } = analysisResult;
  const { identifiedRoutes } = routeAnalysisResult;

  const totalWords = useMemo(
    () => blocks.reduce((acc, b) => acc + countWordsInScript(b.content), 0),
    [blocks],
  );

  const characterWordCounts = useMemo(() => {
    const counts = new Map<string, number>();
    const DIALOGUE_RE = /(?:[a-zA-Z0-9_]+\s)?"((?:\\.|[^"\\])*)"/;
    dialogueLines.forEach((lines, blockId) => {
      const block = blocks.find(b => b.id === blockId);
      if (!block) return;
      const scriptLines = block.content.split('\n');
      lines.forEach(dl => {
        const rawLine = scriptLines[dl.line] ?? '';
        const m = rawLine.match(DIALOGUE_RE);
        if (!m) return;
        const wordCount = m[1].trim().split(/\s+/).filter(Boolean).length;
        const tag = dl.tag || 'narrator';
        counts.set(tag, (counts.get(tag) ?? 0) + wordCount);
      });
    });
    return counts;
  }, [blocks, dialogueLines]);

  const { dialogueWords, narrationWords } = useMemo(() => {
    let dialogue = 0;
    let narration = 0;
    characterWordCounts.forEach((words, tag) => {
      if (tag === 'narrator') narration += words;
      else dialogue += words;
    });
    return { dialogueWords: dialogue, narrationWords: narration };
  }, [characterWordCounts]);

  const labelCount = useMemo(() => Object.keys(labels).length, [labels]);

  const complexity = useMemo(
    () => getComplexityBucket(branchingBlockIds.size, blocks.length, identifiedRoutes.length),
    [branchingBlockIds.size, blocks.length, identifiedRoutes.length],
  );

  const charChartData = useMemo(() => {
    const data: { name: string; words: number; color: string }[] = [];
    characterWordCounts.forEach((words, tag) => {
      const char = characters.get(tag);
      data.push({ name: char?.name || tag, words, color: char?.color || '#6366f1' });
    });
    return data.sort((a, b) => b.words - a.words);
  }, [characterWordCounts, characters]);

  const displayedChars = useMemo(
    () => charLimit === 'all' ? charChartData : charChartData.slice(0, charLimit),
    [charChartData, charLimit],
  );

  const lineChartData = useMemo(() => {
    const all = blocks
      .map(b => ({
        name: b.title || b.filePath?.split('/').pop() || 'Untitled',
        lines: b.content.split('\n').length,
      }))
      .sort((a, b) => b.lines - a.lines);
    return fileLimit === 'all' ? all : all.slice(0, fileLimit);
  }, [blocks, fileLimit]);

  if (blocks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-secondary gap-3">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 opacity-30" viewBox="0 0 20 20" fill="currentColor">
          <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zm6-4a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zm6-3a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
        </svg>
        <p className="text-lg font-medium">No script loaded yet</p>
        <p className="text-sm">Open a project to see statistics.</p>
      </div>
    );
  }

  const estimatedMinutes = Math.round(totalWords / 200);
  const branchRatioPercent = Math.round((branchingBlockIds.size / Math.max(1, blocks.length)) * 100);

  return (
    <div className="h-full overflow-y-auto p-6 text-primary">
      <h1 className="text-2xl font-bold mb-6">Script Statistics</h1>

      {/* Writing */}
      <SectionLabel>Writing</SectionLabel>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Total Words"
          value={totalWords.toLocaleString()}
          sub="dialogue & narration"
        />
        <StatCard
          label="Estimated Playtime"
          value={
            estimatedMinutes < 60
              ? `${estimatedMinutes} min`
              : `${Math.floor(estimatedMinutes / 60)}h ${estimatedMinutes % 60}m`
          }
          sub="at 200 words/min"
        />
        <StatCard
          label="Dialogue Words"
          value={dialogueWords.toLocaleString()}
          sub={totalWords > 0 ? `${Math.round((dialogueWords / totalWords) * 100)}% of total` : 'characters speaking'}
        />
        <StatCard
          label="Narration Words"
          value={narrationWords.toLocaleString()}
          sub={totalWords > 0 ? `${Math.round((narrationWords / totalWords) * 100)}% of total` : 'narrator lines'}
        />
      </div>

      {/* Structure */}
      <SectionLabel>Structure</SectionLabel>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-4">
        <StatCard
          label="Script Files"
          value={blocks.length.toLocaleString()}
          sub=".rpy files"
        />
        <StatCard
          label="Characters"
          value={characters.size.toLocaleString()}
          sub={`${charChartData.length} speaking`}
        />
        <StatCard
          label="Labels"
          value={labelCount.toLocaleString()}
          sub="named script points"
        />
        <StatCard
          label="Menus / Branches"
          value={branchingBlockIds.size.toLocaleString()}
          sub="files with choices"
        />
        <StatCard
          label="Identified Routes"
          value={identifiedRoutes.length.toLocaleString()}
          sub="unique story paths"
        />
      </div>

      {/* Complexity banner */}
      <div className="mb-8 bg-secondary rounded-lg p-4 flex items-center gap-4">
        <span
          className="text-sm font-bold px-3 py-1.5 rounded-full text-white flex-shrink-0"
          style={{ backgroundColor: COMPLEXITY_COLORS[complexity] }}
        >
          {complexity}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-primary">Story Complexity</p>
          <p className="text-xs text-secondary">{COMPLEXITY_DESCRIPTIONS[complexity]}</p>
        </div>
        <div className="ml-auto text-right text-xs text-secondary flex-shrink-0">
          <p>{branchRatioPercent}% of files branch</p>
          <p>{identifiedRoutes.length} route{identifiedRoutes.length !== 1 ? 's' : ''} identified</p>
        </div>
      </div>

      {/* Assets & Health */}
      <SectionLabel>Assets &amp; Health</SectionLabel>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        <StatCard
          label="Image Assets"
          value={imageCount.toLocaleString()}
          sub="tracked images"
        />
        <StatCard
          label="Audio Assets"
          value={audioCount.toLocaleString()}
          sub="tracked audio files"
        />
        <StatCard
          label={diagnosticsErrorCount > 0 ? 'Script Errors' : 'No Errors'}
          value={
            diagnosticsErrorCount > 0
              ? <span className="text-red-500">{diagnosticsErrorCount}</span>
              : <span className="text-green-500">✓</span>
          }
          sub={diagnosticsErrorCount > 0 ? 'open Diagnostics tab →' : 'project looks clean'}
          onClick={diagnosticsErrorCount > 0 ? onOpenDiagnostics : undefined}
        />
      </div>

      {/* Word count by character */}
      {charChartData.length > 0 && (
        <section className="mb-8">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-lg font-semibold">Word Count by Character</h2>
            <div className="flex items-center gap-1">
              {CHAR_LIMITS.map(l => (
                <button
                  key={String(l)}
                  onClick={() => setCharLimit(l)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    charLimit === l
                      ? 'bg-indigo-600 text-white'
                      : 'bg-tertiary text-secondary hover:bg-tertiary-hover'
                  }`}
                >
                  {l === 'all' ? 'All' : `Top ${l}`}
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-secondary mb-3">
            Showing {displayedChars.length} of {charChartData.length} speaking character{charChartData.length !== 1 ? 's' : ''}
            {characters.size > charChartData.length && ` (${characters.size - charChartData.length} defined with no dialogue)`}
          </p>
          {displayedChars.length > 6 ? (
            <CharacterTable data={displayedChars} />
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(160, displayedChars.length * 40)}>
              <BarChart
                data={displayedChars}
                layout="vertical"
                margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" className="stroke-primary opacity-20" />
                <XAxis type="number" tick={{ fontSize: 12 }} />
                <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value: number) => [value.toLocaleString(), 'Words']} />
                <Bar dataKey="words" radius={[0, 4, 4, 0]}>
                  {displayedChars.map((entry, index) => (
                    <Cell key={index} fill={entry.color || '#6366f1'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </section>
      )}

      {/* Lines by file */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Lines of Script by File</h2>
          <div className="flex items-center gap-1">
            {FILE_LIMITS.map(l => (
              <button
                key={String(l)}
                onClick={() => setFileLimit(l)}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  fileLimit === l
                    ? 'bg-indigo-600 text-white'
                    : 'bg-tertiary text-secondary hover:bg-tertiary-hover'
                }`}
              >
                {l === 'all' ? 'All' : `Top ${l}`}
              </button>
            ))}
          </div>
        </div>
        {fileLimit !== 'all' && blocks.length > fileLimit && (
          <p className="text-xs text-secondary mb-2">
            Showing {fileLimit} of {blocks.length} files by line count
          </p>
        )}
        <ResponsiveContainer width="100%" height={Math.max(200, lineChartData.length * 28)}>
          <BarChart
            data={lineChartData}
            layout="vertical"
            margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" className="stroke-primary opacity-20" />
            <XAxis type="number" tick={{ fontSize: 12 }} />
            <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(value: number) => [value.toLocaleString(), 'Lines']} />
            <Bar dataKey="lines" fill="#6366f1" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </section>
    </div>
  );
};

export default StatsView;
