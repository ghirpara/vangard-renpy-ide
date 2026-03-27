import React, { useState, useMemo } from 'react';
import type { Character, Variable, ProjectImage, ImageMetadata, RenpyAudio, AudioMetadata, RenpyScreen, RenpyAnalysisResult, UserSnippet } from '../types';
import VariableManager from './VariableManager';
import ImageManager from './ImageManager';
import AudioManager from './AudioManager';
import SnippetManager from './SnippetManager';
import ScreenManager from './ScreenManager';
import MenuConstructor from './MenuConstructor';

interface StoryElementsPanelProps {
    analysisResult: RenpyAnalysisResult;
    // Character callbacks
    onOpenCharacterEditor: (tag: string) => void;
    onFindCharacterUsages: (tag: string) => void;
    // Variable callbacks
    onAddVariable: (variable: Omit<Variable, 'definedInBlockId' | 'line'>) => void;
    onFindVariableUsages: (variableName: string) => void;
    // Screen callbacks
    onAddScreen: (screenName: string) => void;
    onFindScreenDefinition: (screenName: string) => void;
    // Image props & callbacks
    projectImages: Map<string, ProjectImage>;
    imageMetadata: Map<string, ImageMetadata>;
    imageScanDirectories: Map<string, FileSystemDirectoryHandle>;
    onAddImageScanDirectory: () => void;
    onRemoveImageScanDirectory: (dirName: string) => void;
    onCopyImagesToProject: (sourceFilePaths: string[]) => void;
    onUpdateImageMetadata: (filePath: string, newMetadata: ImageMetadata) => void;
    onOpenImageEditor: (filePath: string) => void;
    imagesLastScanned: number | null;
    isRefreshingImages: boolean;
    onRefreshImages: () => void;
    // Audio props & callbacks
    projectAudios: Map<string, RenpyAudio>;
    audioMetadata: Map<string, AudioMetadata>;
    audioScanDirectories: Map<string, FileSystemDirectoryHandle>;
    onAddAudioScanDirectory: () => void;
    onRemoveAudioScanDirectory: (dirName: string) => void;
    onCopyAudiosToProject: (sourceFilePaths: string[]) => void;
    onUpdateAudioMetadata: (filePath: string, newMetadata: AudioMetadata) => void;
    onOpenAudioEditor: (filePath: string) => void;
    audiosLastScanned: number | null;
    isRefreshingAudios: boolean;
    onRefreshAudios: () => void;
    isFileSystemApiSupported: boolean;
    // Hover highlight callbacks
    onHoverHighlightStart: (key: string, type: 'character' | 'variable') => void;
    onHoverHighlightEnd: () => void;
    
    // Scene Props
    scenes: { id: string, name: string }[];
    onOpenScene: (sceneId: string) => void;
    onCreateScene: (name?: string) => void;
    onDeleteScene: (sceneId: string) => void;

    // ImageMap Props
    imagemaps: { id: string, name: string }[];
    onOpenImageMap: (imagemapId: string) => void;
    onCreateImageMap: (name?: string) => void;
    onDeleteImageMap: (imagemapId: string) => void;

    // Snippet Props
    snippetCategoriesState: Record<string, boolean>;
    onToggleSnippetCategory: (name: string, isOpen: boolean) => void;
    userSnippets?: UserSnippet[];
    onCreateSnippet?: () => void;
    onEditSnippet?: (snippet: UserSnippet) => void;
    onDeleteSnippet?: (snippetId: string) => void;
}

type Tab = 'characters' | 'variables' | 'images' | 'audio' | 'screens' | 'snippets' | 'composers' | 'menus';

const TabButton: React.FC<{
  label: string;
  count?: number;
  isActive: boolean;
  onClick: () => void;
  className?: string;
}> = ({ label, count, isActive, onClick, className = '' }) => (
  <button
    onClick={onClick}
    className={`flex-none py-2 px-2 text-sm font-semibold border-b-2 transition-colors duration-200 flex items-center justify-center ${
      isActive
        ? 'border-accent text-accent bg-secondary'
        : 'border-transparent text-secondary hover:text-primary hover:bg-tertiary-hover'
    } ${className}`}
  >
    <span>{label}</span>
    {typeof count !== 'undefined' && <span className="ml-1.5 text-xs opacity-70">({count})</span>}
  </button>
);

const StoryElementsPanel: React.FC<StoryElementsPanelProps> = ({
    analysisResult,
    onOpenCharacterEditor, onFindCharacterUsages,
    onAddVariable, onFindVariableUsages,
    onAddScreen, onFindScreenDefinition,
    projectImages, imageMetadata, onAddImageScanDirectory, onRemoveImageScanDirectory, imageScanDirectories, onCopyImagesToProject, onUpdateImageMetadata, onOpenImageEditor, imagesLastScanned, isRefreshingImages, onRefreshImages,
    projectAudios, audioMetadata, onAddAudioScanDirectory, onRemoveAudioScanDirectory, audioScanDirectories, onCopyAudiosToProject, onUpdateAudioMetadata, onOpenAudioEditor, audiosLastScanned, isRefreshingAudios, onRefreshAudios,
    isFileSystemApiSupported,
    onHoverHighlightStart, onHoverHighlightEnd,
    scenes, onOpenScene, onCreateScene, onDeleteScene,
    imagemaps, onOpenImageMap, onCreateImageMap, onDeleteImageMap,
    snippetCategoriesState, onToggleSnippetCategory,
    userSnippets, onCreateSnippet, onEditSnippet, onDeleteSnippet,
}) => {
    const [activeTab, setActiveTab] = useState<Tab>('characters');

    const { characters, characterUsage } = analysisResult;
    const characterList = Array.from(characters.values()).sort((a: Character, b: Character) => a.name.localeCompare(b.name));

    const handleCharacterDragStart = (e: React.DragEvent, char: Character) => {
        e.dataTransfer.setData('application/renpy-dnd', JSON.stringify({
            text: `${char.tag} "..."`
        }));
        e.dataTransfer.setData('text/plain', `${char.tag} "..."`);
        e.dataTransfer.effectAllowed = 'copy';
    };

    return (
        <div className="h-full bg-secondary text-primary flex flex-col min-h-0">
            <header className="flex-none p-4 border-b border-primary">
                <h2 className="text-xl font-bold">Story Elements</h2>
            </header>
            <nav className="flex-none flex flex-wrap border-b border-primary bg-header">
                <TabButton className="flex-grow" label="Chars" count={characterList.length} isActive={activeTab === 'characters'} onClick={() => setActiveTab('characters')} />
                <TabButton className="flex-grow" label="Vars" count={analysisResult.variables.size} isActive={activeTab === 'variables'} onClick={() => setActiveTab('variables')} />
                <TabButton className="flex-grow" label="Img" count={projectImages.size} isActive={activeTab === 'images'} onClick={() => setActiveTab('images')} />
                <TabButton className="flex-grow" label="Snd" count={projectAudios.size} isActive={activeTab === 'audio'} onClick={() => setActiveTab('audio')} />
                <TabButton className="flex-grow" label="Scrn" count={analysisResult.screens.size} isActive={activeTab === 'screens'} onClick={() => setActiveTab('screens')} />
                <TabButton className="flex-grow" label="Composers" count={scenes.length + imagemaps.length} isActive={activeTab === 'composers'} onClick={() => setActiveTab('composers')} />
                <TabButton className="flex-grow" label="Menus" isActive={activeTab === 'menus'} onClick={() => setActiveTab('menus')} />
                <TabButton className="flex-grow" label="Code" isActive={activeTab === 'snippets'} onClick={() => setActiveTab('snippets')} />
            </nav>
            <main className="flex-grow flex flex-col min-h-0 overflow-hidden relative">
                {activeTab === 'characters' && (
                    <div className="flex-grow overflow-y-auto p-4 overscroll-contain space-y-3">
                        <div className="flex justify-between items-center">
                            <h3 className="font-semibold">Characters ({characterList.length})</h3>
                            <button onClick={() => onOpenCharacterEditor('new_character')} className="px-3 py-1 rounded bg-accent hover:bg-accent-hover text-white text-sm font-bold">+ Add</button>
                        </div>
                        <ul className="space-y-2">
                            {characterList.map((char: Character) => (
                                <li
                                  key={char.tag}
                                  draggable
                                  onDragStart={(e) => handleCharacterDragStart(e, char)}
                                  className="p-2 rounded-md bg-secondary border border-primary flex items-center justify-between cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow"
                                  onMouseEnter={() => onHoverHighlightStart(char.tag, 'character')}
                                  onMouseLeave={onHoverHighlightEnd}
                                  title="Drag to editor to insert dialogue"
                                >
                                    <div className="flex items-center space-x-3 min-w-0 pointer-events-none">
                                        <div className="w-6 h-6 rounded-full flex-shrink-0" style={{ backgroundColor: char.color }}></div>
                                        <div className="min-w-0">
                                            <p className="font-semibold truncate text-primary">{char.name}</p>
                                            <p className="text-xs text-secondary font-mono truncate">{char.tag}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center space-x-1 flex-shrink-0 pl-2">
                                        <span className="text-xs text-secondary mr-2">({characterUsage.get(char.tag) || 0} lines)</span>
                                        <button onClick={() => onFindCharacterUsages(char.tag)} title="Find Usages" className="p-1 text-secondary hover:text-accent rounded">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                                        </button>
                                        <button onClick={() => onOpenCharacterEditor(char.tag)} title="Edit Character" className="p-1 text-secondary hover:text-accent rounded">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L15.232 5.232z" /></svg>
                                        </button>
                                    </div>
                                </li>
                            ))}
                            {characterList.length === 0 && <p className="text-sm text-secondary text-center py-4">No characters defined yet.</p>}
                        </ul>
                    </div>
                )}
                {activeTab === 'variables' && (
                    <div className="flex-grow overflow-y-auto p-4 overscroll-contain">
                        <VariableManager
                            analysisResult={analysisResult}
                            onAddVariable={onAddVariable}
                            onFindUsages={onFindVariableUsages}
                            onHoverHighlightStart={onHoverHighlightStart}
                            onHoverHighlightEnd={onHoverHighlightEnd}
                        />
                    </div>
                )}
                {activeTab === 'images' && (
                    <div className="h-full flex flex-col">
                        <div className="flex-1 overflow-hidden">
                            <ImageManager
                                images={Array.from(projectImages.values())}
                                metadata={imageMetadata}
                                scanDirectories={Array.from(imageScanDirectories.keys())}
                                onAddScanDirectory={onAddImageScanDirectory}
                                onRemoveScanDirectory={onRemoveImageScanDirectory}
                                onCopyImagesToProject={onCopyImagesToProject}
                                onOpenImageEditor={onOpenImageEditor}
                                isFileSystemApiSupported={isFileSystemApiSupported}
                                lastScanned={imagesLastScanned}
                                isRefreshing={isRefreshingImages}
                                onRefresh={onRefreshImages}
                            />
                        </div>
                    </div>
                )}
                {activeTab === 'audio' && (
                    <div className="h-full flex flex-col">
                        <div className="flex-1 overflow-hidden">
                            <AudioManager
                                audios={Array.from(projectAudios.values())}
                                metadata={audioMetadata}
                                scanDirectories={Array.from(audioScanDirectories.keys())}
                                onAddScanDirectory={onAddAudioScanDirectory}
                                onRemoveScanDirectory={onRemoveAudioScanDirectory}
                                onCopyAudiosToProject={onCopyAudiosToProject}
                                onOpenAudioEditor={onOpenAudioEditor}
                                isFileSystemApiSupported={isFileSystemApiSupported}
                                lastScanned={audiosLastScanned}
                                isRefreshing={isRefreshingAudios}
                                onRefresh={onRefreshAudios}
                            />
                        </div>
                    </div>
                )}
                {activeTab === 'screens' && (
                    <div className="flex-grow overflow-y-auto p-4 overscroll-contain">
                        <ScreenManager
                            screens={analysisResult.screens}
                            onAddScreen={onAddScreen}
                            onFindDefinition={onFindScreenDefinition}
                        />
                    </div>
                )}
                {activeTab === 'composers' && (
                    <div className="flex-grow overflow-y-auto p-4 overscroll-contain space-y-3">
                        <div className="flex justify-between items-center">
                            <h3 className="font-semibold">Scene Compositions ({scenes.length})</h3>
                            <button onClick={() => onCreateScene()} className="px-3 py-1 rounded bg-accent hover:bg-accent-hover text-white text-sm font-bold">+ New Scene</button>
                        </div>
                        <ul className="space-y-2">
                            {scenes.map(scene => (
                                <li key={scene.id} className="p-3 rounded-md bg-tertiary border border-primary flex items-center justify-between group hover:shadow-md transition-shadow">
                                    <div className="flex-grow cursor-pointer" onClick={() => onOpenScene(scene.id)}>
                                        <p className="font-semibold text-sm">{scene.name}</p>
                                    </div>
                                    <button 
                                        onClick={() => onDeleteScene(scene.id)} 
                                        className="p-1 text-secondary hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                        title="Delete Scene"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                    </button>
                                </li>
                            ))}
                            {scenes.length === 0 && <p className="text-sm text-secondary text-center py-4">No scenes created yet.</p>}
                        </ul>

                        {/* ImageMaps Section */}
                        <div className="flex justify-between items-center mt-6">
                            <h3 className="font-semibold">ImageMaps ({imagemaps.length})</h3>
                            <button onClick={() => onCreateImageMap()} className="px-3 py-1 rounded bg-accent hover:bg-accent-hover text-white text-sm font-bold">+ New ImageMap</button>
                        </div>
                        <ul className="space-y-2">
                            {imagemaps.map(imagemap => (
                                <li key={imagemap.id} className="p-3 rounded-md bg-tertiary border border-primary flex items-center justify-between group hover:shadow-md transition-shadow">
                                    <div className="flex-grow cursor-pointer" onClick={() => onOpenImageMap(imagemap.id)}>
                                        <p className="font-semibold text-sm">{imagemap.name}</p>
                                    </div>
                                    <button
                                        onClick={() => onDeleteImageMap(imagemap.id)}
                                        className="p-1 text-secondary hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                        title="Delete ImageMap"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                    </button>
                                </li>
                            ))}
                            {imagemaps.length === 0 && <p className="text-sm text-secondary text-center py-4">No imagemaps created yet.</p>}
                        </ul>
                    </div>
                )}
                {activeTab === 'menus' && (
                    <div className="flex-grow h-full overflow-hidden">
                        <MenuConstructor analysisResult={analysisResult} />
                    </div>
                )}
                {activeTab === 'snippets' && (
                    <div className="flex-grow overflow-y-auto p-4 overscroll-contain">
                        <SnippetManager
                            categoriesState={snippetCategoriesState}
                            onToggleCategory={onToggleSnippetCategory}
                            userSnippets={userSnippets}
                            onCreateSnippet={onCreateSnippet}
                            onEditSnippet={onEditSnippet}
                            onDeleteSnippet={onDeleteSnippet}
                        />
                    </div>
                )}
            </main>
        </div>
    );
};

export default StoryElementsPanel;