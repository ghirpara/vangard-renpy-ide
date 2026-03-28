import React, { useState, useCallback, useMemo } from 'react';
import { ScreenModel, ScreenComponent, ProjectImage } from '../types';
import { useImmer } from 'use-immer';
import CopyButton from './CopyButton';

interface ScreenEditorViewProps {
  screenModel: ScreenModel;
  onChange: (model: ScreenModel) => void;
  projectImages: ProjectImage[];
}

const COMPONENT_TYPES = [
  { type: 'frame', label: 'Frame', icon: '□' },
  { type: 'vbox', label: 'VBox', icon: '☰' },
  { type: 'hbox', label: 'HBox', icon: '|||' },
  { type: 'text', label: 'Text', icon: 'T' },
  { type: 'textbutton', label: 'Text Button', icon: '[T]' },
  { type: 'imagebutton', label: 'Image Button', icon: '[IMG]' },
  { type: 'image', label: 'Image', icon: '🖼' },
  { type: 'null', label: 'Null (Spacer)', icon: '∅' },
];

const DEFAULT_PROPS: Record<string, any> = {
  frame: { xpadding: 10, ypadding: 10, background: '#333333' },
  vbox: { spacing: 10 },
  hbox: { spacing: 10 },
  text: { text: "New Text", size: 22, color: "#ffffff" },
  textbutton: { text: "Button", action: "NullAction()" },
  imagebutton: { idle: "idle.png", hover: "hover.png", action: "NullAction()" },
  image: { file: "image.png" },
  null: { width: 10, height: 10 },
};

export default function ScreenEditorView({ screenModel, onChange, projectImages }: ScreenEditorViewProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draggedComponentId, setDraggedComponentId] = useState<string | null>(null);

  const handleAddComponent = (type: ScreenComponent['type'], parentId: string | null = null) => {
    const newComponent: ScreenComponent = {
      id: `comp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      name: `${type}_${Math.floor(Math.random() * 1000)}`,
      props: { ...DEFAULT_PROPS[type] },
      children: []
    };

    const newModel = { ...screenModel };
    
    if (!parentId) {
      newModel.components = [...newModel.components, newComponent];
    } else {
      const addToParent = (comps: ScreenComponent[]): boolean => {
        for (const comp of comps) {
          if (comp.id === parentId) {
            comp.children.push(newComponent);
            return true;
          }
          if (addToParent(comp.children)) return true;
        }
        return false;
      };
      addToParent(newModel.components);
    }
    
    onChange(newModel);
    setSelectedId(newComponent.id);
  };

  const handleDeleteComponent = (id: string) => {
    const deleteFromList = (comps: ScreenComponent[]): ScreenComponent[] => {
      return comps.filter(c => {
        if (c.id === id) return false;
        c.children = deleteFromList(c.children);
        return true;
      });
    };

    const newModel = { ...screenModel, components: deleteFromList([...screenModel.components]) };
    onChange(newModel);
    if (selectedId === id) setSelectedId(null);
  };

  const handleUpdateProps = (id: string, props: Record<string, any>) => {
    const updateInList = (comps: ScreenComponent[]): ScreenComponent[] => {
      return comps.map(c => {
        if (c.id === id) return { ...c, props: { ...c.props, ...props } };
        return { ...c, children: updateInList(c.children) };
      });
    };

    const newModel = { ...screenModel, components: updateInList([...screenModel.components]) };
    onChange(newModel);
  };

  const findComponent = (comps: ScreenComponent[], id: string): ScreenComponent | null => {
    for (const c of comps) {
      if (c.id === id) return c;
      const found = findComponent(c.children, id);
      if (found) return found;
    }
    return null;
  };

  const selectedComponent = selectedId ? findComponent(screenModel.components, selectedId) : null;

  const generateRenpyCode = () => {
    let code = `screen ${screenModel.name}():\n`;
    
    const indent = (level: number) => "    ".repeat(level);
    
    const renderProps = (props: Record<string, any>) => {
      return Object.entries(props)
        .map(([k, v]) => {
          if (k === 'text' || k === 'file' || k === 'idle' || k === 'hover') return ''; // Handled specially
          if (typeof v === 'string') return `${k} "${v}"`;
          return `${k} ${v}`;
        })
        .filter(s => s)
        .join(' ');
    };

    const renderComponent = (comp: ScreenComponent, level: number) => {
      let line = indent(level);
      
      if (comp.type === 'text') {
        line += `text "${comp.props.text}" ${renderProps(comp.props)}`;
      } else if (comp.type === 'textbutton') {
        line += `textbutton "${comp.props.text}" ${renderProps(comp.props)}`;
      } else if (comp.type === 'imagebutton') {
        line += `imagebutton idle "${comp.props.idle}" hover "${comp.props.hover}" ${renderProps(comp.props)}`;
      } else if (comp.type === 'image') {
        line += `add "${comp.props.file}" ${renderProps(comp.props)}`;
      } else {
        line += `${comp.type} ${renderProps(comp.props)}:`;
      }
      
      code += line + "\n";
      
      comp.children.forEach(child => renderComponent(child, level + 1));
    };

    screenModel.components.forEach(c => renderComponent(c, 1));
    return code;
  };


  // --- Drag and Drop Logic for Layers ---
  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.stopPropagation();
    setDraggedComponentId(id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetId: string | null) => {
    e.preventDefault();
    e.stopPropagation();
    if (!draggedComponentId || draggedComponentId === targetId) return;

    // Deep clone
    const newComponents = JSON.parse(JSON.stringify(screenModel.components));
    
    // Find and remove dragged item
    let draggedItem: ScreenComponent | null = null;
    const remove = (list: ScreenComponent[]) => {
      const idx = list.findIndex(c => c.id === draggedComponentId);
      if (idx !== -1) {
        draggedItem = list[idx];
        list.splice(idx, 1);
        return true;
      }
      for (const c of list) {
        if (remove(c.children)) return true;
      }
      return false;
    };
    remove(newComponents);

    if (!draggedItem) return;

    // Insert at target
    if (targetId === null) {
      // Drop at root
      newComponents.push(draggedItem);
    } else {
      const insert = (list: ScreenComponent[]) => {
        const idx = list.findIndex(c => c.id === targetId);
        if (idx !== -1) {
          // Insert after target (simple reordering)
          // To support nesting via drag, we'd need more complex hit testing (top/middle/bottom of item)
          // For now, let's assume dropping ON an item nests it if it's a container, or puts it after if not.
          const target = list[idx];
          if (['frame', 'vbox', 'hbox', 'viewport', 'grid'].includes(target.type)) {
             target.children.push(draggedItem!);
          } else {
             list.splice(idx + 1, 0, draggedItem!);
          }
          return true;
        }
        for (const c of list) {
          if (insert(c.children)) return true;
        }
        return false;
      };
      insert(newComponents);
    }

    onChange({ ...screenModel, components: newComponents });
    setDraggedComponentId(null);
  };

  // --- Render Helpers ---
  const renderLayerItem = (comp: ScreenComponent, depth: number) => {
    const isSelected = selectedId === comp.id;
    return (
      <div 
        key={comp.id}
        draggable
        onDragStart={(e) => handleDragStart(e, comp.id)}
        onDragOver={handleDragOver}
        onDrop={(e) => handleDrop(e, comp.id)}
        className={`
          flex items-center py-1 px-2 cursor-pointer border-b border-gray-100 dark:border-gray-700
          ${isSelected ? 'bg-blue-100 dark:bg-blue-900' : 'hover:bg-gray-50 dark:hover:bg-gray-800'}
        `}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={(e) => { e.stopPropagation(); setSelectedId(comp.id); }}
      >
        <span className="mr-2 text-gray-500 text-xs">{
          COMPONENT_TYPES.find(t => t.type === comp.type)?.icon || '•'
        }</span>
        <span className="text-sm truncate flex-1">{comp.name}</span>
        <button 
          className="text-gray-400 hover:text-red-500 ml-2"
          onClick={(e) => { e.stopPropagation(); handleDeleteComponent(comp.id); }}
        >
          ×
        </button>
      </div>
    );
  };

  const renderLayerTree = (comps: ScreenComponent[], depth: number = 0): React.ReactNode => {
    return comps.map(c => (
      <React.Fragment key={c.id}>
        {renderLayerItem(c, depth)}
        {renderLayerTree(c.children, depth + 1)}
      </React.Fragment>
    ));
  };

  const renderCanvasComponent = (comp: ScreenComponent) => {
    const isSelected = selectedId === comp.id;
    const commonStyle: React.CSSProperties = {
      position: 'relative',
      border: isSelected ? '2px solid #3b82f6' : '1px dashed transparent',
      minWidth: '20px',
      minHeight: '20px',
    };

    // Map Ren'Py props to CSS approximations
    const style: React.CSSProperties = { ...commonStyle };
    if (comp.props.xpos) style.left = comp.props.xpos;
    if (comp.props.ypos) style.top = comp.props.ypos;
    if (comp.props.xsize) style.width = comp.props.xsize;
    if (comp.props.ysize) style.height = comp.props.ysize;
    if (comp.props.background) style.backgroundColor = comp.props.background;
    if (comp.props.color) style.color = comp.props.color;
    if (comp.props.size) style.fontSize = comp.props.size;
    
    // Layouts
    if (comp.type === 'vbox') {
      style.display = 'flex';
      style.flexDirection = 'column';
      style.gap = comp.props.spacing || 0;
    } else if (comp.type === 'hbox') {
      style.display = 'flex';
      style.flexDirection = 'row';
      style.gap = comp.props.spacing || 0;
    } else if (comp.type === 'frame') {
      style.padding = `${comp.props.ypadding || 0}px ${comp.props.xpadding || 0}px`;
      style.border = '1px solid #444';
    }

    const handleClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      setSelectedId(comp.id);
    };

    switch (comp.type) {
      case 'text':
        return <div key={comp.id} style={style} onClick={handleClick}>{comp.props.text}</div>;
      case 'textbutton':
        return (
          <button key={comp.id} style={{...style, backgroundColor: '#555', padding: '5px 10px', borderRadius: '4px'}} onClick={handleClick}>
            {comp.props.text}
          </button>
        );
      case 'image':
        return (
          <div key={comp.id} style={style} onClick={handleClick}>
             <img src={comp.props.file} alt="img" className="max-w-full h-auto" />
          </div>
        );
      case 'null':
        return <div key={comp.id} style={style} onClick={handleClick} className="bg-transparent" />;
      default:
        return (
          <div key={comp.id} style={style} onClick={handleClick}>
            {comp.children.map(c => renderCanvasComponent(c))}
            {comp.children.length === 0 && (
              <div className="text-xs text-gray-400 p-2 text-center select-none pointer-events-none">
                {comp.type}
              </div>
            )}
          </div>
        );
    }
  };

  return (
    <div className="flex h-full w-full bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200">
      {/* Left Sidebar: Palette & Layers */}
      <div className="w-64 flex flex-col border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="p-2 border-b border-gray-200 dark:border-gray-700 font-semibold text-sm bg-gray-50 dark:bg-gray-900">
          Palette
        </div>
        <div className="p-2 grid grid-cols-2 gap-2 overflow-y-auto max-h-60">
          {COMPONENT_TYPES.map(c => (
            <button
              key={c.type}
              onClick={() => handleAddComponent(c.type as any, selectedId)}
              className="flex flex-col items-center justify-center p-2 border border-gray-200 dark:border-gray-700 rounded hover:bg-blue-50 dark:hover:bg-blue-900 text-xs"
            >
              <span className="text-lg mb-1">{c.icon}</span>
              {c.label}
            </button>
          ))}
        </div>

        <div className="p-2 border-t border-b border-gray-200 dark:border-gray-700 font-semibold text-sm bg-gray-50 dark:bg-gray-900 flex justify-between items-center">
          <span>Layers</span>
          <span className="text-xs font-normal text-gray-500">Drag to reorder</span>
        </div>
        <div 
          className="flex-1 overflow-y-auto"
          onDragOver={handleDragOver}
          onDrop={(e) => handleDrop(e, null)} // Drop on root
        >
          {renderLayerTree(screenModel.components)}
          {screenModel.components.length === 0 && (
            <div className="p-4 text-center text-gray-400 text-sm italic">
              No components. Add one from the palette.
            </div>
          )}
        </div>
      </div>

      {/* Center: Canvas */}
      <div className="flex-1 flex flex-col relative bg-gray-200 dark:bg-gray-900 overflow-hidden">
        <div className="absolute top-2 right-2 z-10 flex space-x-2">
          <CopyButton text={generateRenpyCode()} />
        </div>
        
        <div className="flex-1 overflow-auto p-8 flex items-center justify-center">
          <div 
            className="bg-white dark:bg-black shadow-lg relative"
            style={{ 
              width: screenModel.width || 1280, 
              height: screenModel.height || 720,
              backgroundColor: screenModel.backgroundColor || '#000000'
            }}
            onClick={() => setSelectedId(null)}
          >
            {screenModel.components.map(c => renderCanvasComponent(c))}
          </div>
        </div>
      </div>

      {/* Right Sidebar: Properties */}
      <div className="w-72 border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-col overflow-y-auto">
        <div className="p-3 border-b border-gray-200 dark:border-gray-700 font-semibold text-sm bg-gray-50 dark:bg-gray-900">
          Properties
        </div>
        
        {selectedComponent ? (
          <div className="p-4 space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Name (ID)</label>
              <input 
                type="text" 
                value={selectedComponent.name}
                onChange={(e) => {
                  const newModel = { ...screenModel };
                  const comp = findComponent(newModel.components, selectedComponent.id);
                  if (comp) comp.name = e.target.value;
                  onChange(newModel);
                }}
                className="w-full px-2 py-1 text-sm border rounded dark:bg-gray-700 dark:border-gray-600"
              />
            </div>

            <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
              <h4 className="text-sm font-semibold mb-2">Common</h4>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-500">X Pos</label>
                  <input 
                    type="number" 
                    value={selectedComponent.props.xpos || ''}
                    onChange={(e) => handleUpdateProps(selectedComponent.id, { xpos: parseInt(e.target.value) })}
                    className="w-full px-2 py-1 text-sm border rounded dark:bg-gray-700 dark:border-gray-600"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500">Y Pos</label>
                  <input 
                    type="number" 
                    value={selectedComponent.props.ypos || ''}
                    onChange={(e) => handleUpdateProps(selectedComponent.id, { ypos: parseInt(e.target.value) })}
                    className="w-full px-2 py-1 text-sm border rounded dark:bg-gray-700 dark:border-gray-600"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500">Width</label>
                  <input 
                    type="number" 
                    value={selectedComponent.props.xsize || ''}
                    onChange={(e) => handleUpdateProps(selectedComponent.id, { xsize: parseInt(e.target.value) })}
                    className="w-full px-2 py-1 text-sm border rounded dark:bg-gray-700 dark:border-gray-600"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500">Height</label>
                  <input 
                    type="number" 
                    value={selectedComponent.props.ysize || ''}
                    onChange={(e) => handleUpdateProps(selectedComponent.id, { ysize: parseInt(e.target.value) })}
                    className="w-full px-2 py-1 text-sm border rounded dark:bg-gray-700 dark:border-gray-600"
                  />
                </div>
              </div>
            </div>

            {/* Type Specific Props */}
            {(selectedComponent.type === 'text' || selectedComponent.type === 'textbutton') && (
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <h4 className="text-sm font-semibold mb-2">Text</h4>
                <div className="space-y-2">
                  <div>
                    <label className="block text-xs text-gray-500">Content</label>
                    <input 
                      type="text" 
                      value={selectedComponent.props.text || ''}
                      onChange={(e) => handleUpdateProps(selectedComponent.id, { text: e.target.value })}
                      className="w-full px-2 py-1 text-sm border rounded dark:bg-gray-700 dark:border-gray-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500">Size</label>
                    <input 
                      type="number" 
                      value={selectedComponent.props.size || ''}
                      onChange={(e) => handleUpdateProps(selectedComponent.id, { size: parseInt(e.target.value) })}
                      className="w-full px-2 py-1 text-sm border rounded dark:bg-gray-700 dark:border-gray-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500">Color</label>
                    <input 
                      type="color" 
                      value={selectedComponent.props.color || '#ffffff'}
                      onChange={(e) => handleUpdateProps(selectedComponent.id, { color: e.target.value })}
                      className="w-full h-8 p-1 border rounded dark:bg-gray-700 dark:border-gray-600"
                    />
                  </div>
                </div>
              </div>
            )}

            {(selectedComponent.type === 'vbox' || selectedComponent.type === 'hbox') && (
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <h4 className="text-sm font-semibold mb-2">Layout</h4>
                <div>
                  <label className="block text-xs text-gray-500">Spacing</label>
                  <input 
                    type="number" 
                    value={selectedComponent.props.spacing || 0}
                    onChange={(e) => handleUpdateProps(selectedComponent.id, { spacing: parseInt(e.target.value) })}
                    className="w-full px-2 py-1 text-sm border rounded dark:bg-gray-700 dark:border-gray-600"
                  />
                </div>
              </div>
            )}

            {(selectedComponent.type === 'textbutton' || selectedComponent.type === 'imagebutton') && (
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <h4 className="text-sm font-semibold mb-2">Action</h4>
                <div>
                  <label className="block text-xs text-gray-500">On Click</label>
                  <input 
                    type="text" 
                    value={selectedComponent.props.action || ''}
                    onChange={(e) => handleUpdateProps(selectedComponent.id, { action: e.target.value })}
                    placeholder="e.g. Jump('start')"
                    className="w-full px-2 py-1 text-sm border rounded dark:bg-gray-700 dark:border-gray-600"
                  />
                </div>
              </div>
            )}

            {(selectedComponent.type === 'image' || selectedComponent.type === 'imagebutton') && (
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <h4 className="text-sm font-semibold mb-2">Image Source</h4>
                {selectedComponent.type === 'image' && (
                   <div className="mb-2">
                    <label className="block text-xs text-gray-500">File</label>
                    <select 
                      value={selectedComponent.props.file || ''}
                      onChange={(e) => handleUpdateProps(selectedComponent.id, { file: e.target.value })}
                      className="w-full px-2 py-1 text-sm border rounded dark:bg-gray-700 dark:border-gray-600"
                    >
                      <option value="">Select Image...</option>
                      {projectImages.map(img => (
                        <option key={img.filePath} value={img.projectFilePath || img.filePath}>{img.fileName}</option>
                      ))}
                    </select>
                  </div>
                )}
                {selectedComponent.type === 'imagebutton' && (
                  <>
                    <div className="mb-2">
                      <label className="block text-xs text-gray-500">Idle Image</label>
                      <select 
                        value={selectedComponent.props.idle || ''}
                        onChange={(e) => handleUpdateProps(selectedComponent.id, { idle: e.target.value })}
                        className="w-full px-2 py-1 text-sm border rounded dark:bg-gray-700 dark:border-gray-600"
                      >
                        <option value="">Select Image...</option>
                        {projectImages.map(img => (
                          <option key={img.filePath} value={img.projectFilePath || img.filePath}>{img.fileName}</option>
                        ))}
                      </select>
                    </div>
                    <div className="mb-2">
                      <label className="block text-xs text-gray-500">Hover Image</label>
                      <select 
                        value={selectedComponent.props.hover || ''}
                        onChange={(e) => handleUpdateProps(selectedComponent.id, { hover: e.target.value })}
                        className="w-full px-2 py-1 text-sm border rounded dark:bg-gray-700 dark:border-gray-600"
                      >
                        <option value="">Select Image...</option>
                        {projectImages.map(img => (
                          <option key={img.filePath} value={img.projectFilePath || img.filePath}>{img.fileName}</option>
                        ))}
                      </select>
                    </div>
                  </>
                )}
              </div>
            )}

          </div>
        ) : (
          <div className="p-4 text-center text-gray-500 text-sm">
            Select a component to edit properties.
            <div className="mt-4 border-t pt-4 text-left">
              <h4 className="font-semibold mb-2">Screen Settings</h4>
              <div className="space-y-2">
                <div>
                  <label className="block text-xs text-gray-500">Name</label>
                  <input 
                    type="text" 
                    value={screenModel.name}
                    onChange={(e) => onChange({ ...screenModel, name: e.target.value })}
                    className="w-full px-2 py-1 text-sm border rounded dark:bg-gray-700 dark:border-gray-600"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500">Background Color</label>
                  <input 
                    type="color" 
                    value={screenModel.backgroundColor || '#000000'}
                    onChange={(e) => onChange({ ...screenModel, backgroundColor: e.target.value })}
                    className="w-full h-8 p-1 border rounded dark:bg-gray-700 dark:border-gray-600"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}