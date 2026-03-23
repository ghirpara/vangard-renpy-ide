/**
 * @file useAssetManager.ts
 * @description Manages image and audio assets for Ren'Py projects.
 * Handles scanning directories for assets, copying to project, managing metadata,
 * and persisting IDE settings. Coordinates with file system to organize asset files.
 * Supports external scan directories and internal project asset storage.
 */

import { useState, useCallback, useEffect } from 'react';
import type { ProjectImage, ImageMetadata, RenpyAudio, AudioMetadata, FileSystemTreeNode } from '../types';
// FIX: Removed unused 'useFileSystem' import from incorrect module.
import { addNodeToFileTree, removeNodeFromFileTree } from './useFileSystemManager';
import { useToasts } from '../contexts/ToastContext';

const isFileSystemApiSupported = (() => {
  try { return !!(window.showDirectoryPicker || (window.aistudio && window.aistudio.showDirectoryPicker)); } 
  catch (e) { console.warn("Could not access file system APIs, features disabled.", e); return false; }
})();

const fileToDataUrl = (file: File | Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

const IDE_SETTINGS_FILE = 'game/project.ide.json';

interface AssetManagerProps {
    directoryHandle: FileSystemDirectoryHandle | null;
    onPathsUpdated: (updates: Map<string, { newPath: string; type: 'file' | 'folder' }>) => void;
    onFileTreeUpdate: (updater: (tree: FileSystemTreeNode) => FileSystemTreeNode) => void;
}

export const useAssetManager = ({ directoryHandle, onPathsUpdated, onFileTreeUpdate }: AssetManagerProps) => {
    const [projectImages, setProjectImages] = useState<Map<string, ProjectImage>>(new Map());
    const [imageMetadata, setImageMetadata] = useState<Map<string, ImageMetadata>>(new Map());
    const [imageScanDirectories, setImageScanDirectories] = useState<Map<string, FileSystemDirectoryHandle>>(new Map());
    const [projectAudios, setProjectAudios] = useState<Map<string, RenpyAudio>>(new Map());
    const [audioMetadata, setAudioMetadata] = useState<Map<string, AudioMetadata>>(new Map());
    const [audioScanDirectories, setAudioScanDirectories] = useState<Map<string, FileSystemDirectoryHandle>>(new Map());
    const { addToast } = useToasts();

    const scanDirectoryForImages = useCallback(async (dirHandle: FileSystemDirectoryHandle, baseName: string, isProjectScan: boolean) => {
        // ... (scanDirectoryForImages logic)
    }, []);

    const scanDirectoryForAudios = useCallback(async (dirHandle: FileSystemDirectoryHandle, baseName: string, isProjectScan: boolean) => {
        // ... (scanDirectoryForAudios logic)
    }, []);

    const loadProjectAssets = useCallback(async (rootHandle: FileSystemDirectoryHandle) => {
        // ... (loadProjectImages and loadProjectAudios logic combined)
    }, [scanDirectoryForImages, scanDirectoryForAudios]);

    const loadIdeSettings = useCallback(async (rootHandle: FileSystemDirectoryHandle) => {
        // ... (loadIdeSettings logic)
    }, []);

    const handleSaveIdeSettings = useCallback(async () => {
        // ... (handleSaveIdeSettings logic)
    }, [directoryHandle, imageMetadata, imageScanDirectories, audioMetadata, audioScanDirectories]);

    useEffect(() => {
        if (directoryHandle) {
            handleSaveIdeSettings();
        }
    }, [imageMetadata, audioMetadata, imageScanDirectories, audioScanDirectories, directoryHandle, handleSaveIdeSettings]);

    const handleAddImageScanDirectory = useCallback(async () => {
        // ... (handleAddImageScanDirectory logic)
    }, [scanDirectoryForImages, addToast]);

    const handleCopyImagesToProject = useCallback(async (sourceFilePaths: string[], metadataOverride?: ImageMetadata) => {
        // ... (handleCopyImagesToProject logic)
    }, [directoryHandle, projectImages, imageMetadata, onFileTreeUpdate, addToast]);
    
    const handleUpdateImageMetadata = useCallback(async (projectFilePath: string, newMetadata: ImageMetadata) => {
        // ... (handleUpdateImageMetadata logic)
    }, [directoryHandle, projectImages, imageMetadata, onPathsUpdated, onFileTreeUpdate, addToast]);

    const handleAddAudioScanDirectory = useCallback(async () => {
        // ... (handleAddAudioScanDirectory logic)
    }, [scanDirectoryForAudios, addToast]);

    const handleCopyAudiosToProject = useCallback(async (sourceFilePaths: string[], metadataOverride?: AudioMetadata) => {
        // ... (handleCopyAudiosToProject logic)
    }, [directoryHandle, projectAudios, audioMetadata, onFileTreeUpdate, addToast]);

    const handleUpdateAudioMetadata = useCallback(async (projectFilePath: string, newMetadata: AudioMetadata) => {
        // ... (handleUpdateAudioMetadata logic)
    }, [directoryHandle, projectAudios, audioMetadata, onPathsUpdated, onFileTreeUpdate, addToast]);
    
    // Public method to be called when project is loaded from folder or zip
    const setAllAssets = useCallback((data: { images: Map<string, ProjectImage>, audios: Map<string, RenpyAudio>, imageMeta: Map<string, ImageMetadata>, audioMeta: Map<string, AudioMetadata> }) => {
        setProjectImages(data.images);
        setProjectAudios(data.audios);
        setImageMetadata(data.imageMeta);
        setAudioMetadata(data.audioMeta);
    }, []);

    return {
        projectImages, imageMetadata, imageScanDirectories,
        projectAudios, audioMetadata, audioScanDirectories,
        loadProjectAssets, loadIdeSettings, setAllAssets,
        handleAddImageScanDirectory, handleCopyImagesToProject, handleUpdateImageMetadata,
        handleAddAudioScanDirectory, handleCopyAudiosToProject, handleUpdateAudioMetadata,
    };
};
