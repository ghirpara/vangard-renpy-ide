
import React, { useState } from 'react';
import type { UserSnippet } from '../types';

interface Snippet {
  title: string;
  description: string;
  code: string;
}

interface SnippetCategory {
  name: string;
  snippets: Snippet[];
}

const SNIPPETS: SnippetCategory[] = [
  {
    name: "Dialogue & Narration",
    snippets: [
      {
        title: "Standard Dialogue",
        description: "A character speaking a line of dialogue.",
        code: `e "I have something to say."`
      },
      {
        title: "Dialogue with Attributes",
        description: "Show a different character image for this line.",
        code: `e happy "This makes me so happy!"`
      },
      {
        title: "Narration",
        description: "Text displayed to the player, not spoken by a character.",
        code: `"The sun sets over the city."`
      },
      {
        title: "NVL-Mode Dialogue",
        description: "Dialogue that appears over the whole screen, like in a novel.",
        code: `nvl clear\n"This is the first line of NVL-mode text."\ne "And characters can speak here, too."\n"This allows for a lot of text to be on screen at once."`
      },
    ]
  },
  {
    name: "Logic & Control Flow",
    snippets: [
      {
        title: "Simple If/Else",
        description: "Execute different paths based on a condition.",
        code: `if has_met_eileen:\n    e "It's good to see you again!"\nelse:\n    e "Nice to meet you."`
      },
      {
        title: "If/Elif/Else",
        description: "Handle multiple conditions in sequence.",
        code: `if score >= 10:\n    "You got an A!"\nelif score >= 5:\n    "You got a B."\nelse:\n    "You got a C."`
      },
      {
        title: "Choice Menu",
        description: "Present the player with a choice.",
        code: `menu:\n    "What should I do?":\n        "Go to the park.":\n            jump park_scene\n        "Stay home.":\n            jump home_scene`
      },
      {
        title: "Jump to Label",
        description: "Unconditionally move to another part of the story.",
        code: `jump end_of_chapter_one`
      },
      {
        title: "Call Label",
        description: "Temporarily jump to a label, then return when it finishes.",
        code: `call check_inventory\n"Okay, back to it."`
      },
    ]
  },
  {
    name: "Images",
    snippets: [
      {
        title: "Show Image",
        description: "Display an image or character sprite.",
        code: `show eileen happy`
      },
      {
        title: "Show at Position",
        description: "Display an image at a specific screen position.",
        code: `show eileen happy at right`
      },
      {
        title: "Scene Statement",
        description: "Clear the screen and show a background.",
        code: `scene bg classroom`
      },
      {
        title: "Hide Image",
        description: "Remove an image from the screen.",
        code: `hide eileen`
      },
      {
        title: "Image Definition",
        description: "Define an image tag pointing to a file.",
        code: `image bg school = "bg/school_day.jpg"`
      },
      {
        title: "Solid Color Definition",
        description: "Create a solid color image.",
        code: `image black = Solid("#000000")`
      },
      {
        title: "Placeholder Definition",
        description: "A placeholder image for prototyping.",
        code: `image eileen = Placeholder("girl")`
      },
      {
        title: "Simple Animation",
        description: "Frame-by-frame animation.",
        code: `image rain:\n    "rain1.png"\n    0.1\n    "rain2.png"\n    0.1\n    "rain3.png"\n    0.1\n    repeat`
      },
      {
        title: "Condition Switch",
        description: "Show different images based on variable states.",
        code: `image eileen = ConditionSwitch(\n    "mood == 'happy'", "eileen_happy.png",\n    "mood == 'sad'", "eileen_sad.png",\n    "True", "eileen_neutral.png"\n)`
      },
      {
        title: "Layered Image",
        description: "Modern layered character sprite definition.",
        code: `layeredimage eileen:\n    always "eileen_base.png"\n    group outfit auto:\n        attribute uniform default\n        attribute casual\n    group face auto:\n        attribute happy default\n        attribute sad`
      }
    ]
  },
  {
    name: "Visuals & Effects",
    snippets: [
      {
        title: "Scene with Transition",
        description: "Clear the screen and show a new background with a fade.",
        code: `scene bg park with fade`
      },
      {
        title: "Simple Transition",
        description: "Use a transition between visual changes.",
        code: `with dissolve`
      },
      {
        title: "Pause",
        description: "Wait for a specified number of seconds.",
        code: `pause 1.5`
      },
    ]
  },
  {
    name: "ATL & Transforms",
    snippets: [
      {
        title: "Basic Transform Definition",
        description: "Define a named transform to reuse later.",
        code: `transform slight_right:\n    xalign 0.75\n    yalign 1.0`
      },
      {
        title: "Linear Movement",
        description: "Move an image from left to right over 2 seconds.",
        code: `transform move_across:\n    xalign 0.0\n    linear 2.0 xalign 1.0`
      },
      {
        title: "Fade In & Out",
        description: "Change opacity (alpha) over time.",
        code: `transform ghost_fade:\n    alpha 0.0\n    linear 1.0 alpha 0.5\n    pause 1.0\n    linear 1.0 alpha 0.0`
      },
      {
        title: "Zoom Pop Effect",
        description: "Scale an image up quickly using an easing function.",
        code: `transform pop_in:\n    zoom 0.0\n    easein_back 0.5 zoom 1.0`
      },
      {
        title: "Repeating Bobbing",
        description: "Continuous up and down motion.",
        code: `transform hovering:\n    yoffset 0\n    easein 1.0 yoffset -20\n    easeout 1.0 yoffset 0\n    repeat`
      },
      {
        title: "Parallel Animation",
        description: "Run multiple property changes (e.g. move + rotate) simultaneously.",
        code: `transform roll_across:\n    parallel:\n        xalign 0.0\n        linear 3.0 xalign 1.0\n    parallel:\n        rotate 0\n        linear 3.0 rotate 360`
      },
      {
        title: "On Show/Hide Events",
        description: "Trigger specific animations when the image appears or disappears.",
        code: `transform slide_in_out:\n    on show:\n        xalign 0.0\n        linear 0.5 xalign 0.5\n    on hide:\n        linear 0.5 xalign 1.0`
      }
    ]
  },
  {
    name: "Audio",
    snippets: [
      {
        title: "Play Music",
        description: "Start playing a music track. Use `fadein` for smooth starts.",
        code: `play music "audio/bgm/town_theme.ogg" fadein 1.0`
      },
      {
        title: "Play Sound Effect",
        description: "Play a one-off sound effect.",
        code: `play sound "audio/sfx/door_open.wav"`
      },
      {
        title: "Stop Music",
        description: "Stop the currently playing music. Use `fadeout` for smooth stops.",
        code: `stop music fadeout 2.0`
      },
      {
        title: "Queue Music",
        description: "Play a music track after the current one finishes.",
        code: `queue music "audio/bgm/night_theme.ogg"`
      }
    ]
  },
];

interface SnippetManagerProps {
    categoriesState?: Record<string, boolean>;
    onToggleCategory?: (name: string, isOpen: boolean) => void;
    userSnippets?: UserSnippet[];
    onCreateSnippet?: () => void;
    onEditSnippet?: (snippet: UserSnippet) => void;
    onDeleteSnippet?: (snippetId: string) => void;
}

const SnippetManager: React.FC<SnippetManagerProps> = ({ categoriesState = {}, onToggleCategory, userSnippets, onCreateSnippet, onEditSnippet, onDeleteSnippet }) => {
    const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);

    const handleCopy = (code: string, title: string) => {
        navigator.clipboard.writeText(code);
        setCopiedSnippet(title);
        setTimeout(() => setCopiedSnippet(null), 2000);
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="font-semibold">Code Snippets</h3>
            </div>

            {/* User Snippets Section */}
            {(userSnippets && userSnippets.length > 0 || onCreateSnippet) && (
                <details open className="group">
                    <summary className="font-semibold text-gray-600 dark:text-gray-400 cursor-pointer list-none flex items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 transition-transform group-open:rotate-90" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>
                        My Snippets
                    </summary>
                    <div className="pl-4 mt-2 space-y-3">
                        {onCreateSnippet && (
                            <button
                                onClick={onCreateSnippet}
                                className="w-full px-3 py-2 text-sm font-semibold text-indigo-600 dark:text-indigo-400 border border-dashed border-indigo-300 dark:border-indigo-600 rounded-md hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors"
                            >
                                + New Snippet
                            </button>
                        )}
                        {userSnippets?.map(snippet => (
                            <div key={snippet.id} className="p-3 rounded-md bg-gray-50 dark:bg-gray-700/50">
                                <div className="flex justify-between items-start">
                                    <div className="flex-1 min-w-0">
                                        <p className="font-semibold">{snippet.title}</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                                            <code className="bg-gray-100 dark:bg-gray-600 px-1 rounded">{snippet.prefix}</code>
                                            {snippet.description && <span className="ml-1">— {snippet.description}</span>}
                                        </p>
                                    </div>
                                    <div className="flex items-center space-x-1 ml-2 flex-shrink-0">
                                        <button
                                            onClick={() => handleCopy(snippet.code, snippet.title)}
                                            className={`px-2 py-1 text-xs font-semibold rounded ${copiedSnippet === snippet.title ? 'bg-green-600 text-white' : 'bg-gray-200 dark:bg-gray-600 hover:bg-indigo-100 dark:hover:bg-indigo-800'}`}
                                        >
                                            {copiedSnippet === snippet.title ? 'Copied!' : 'Copy'}
                                        </button>
                                        {onEditSnippet && (
                                            <button
                                                onClick={() => onEditSnippet(snippet)}
                                                className="px-2 py-1 text-xs font-semibold rounded bg-gray-200 dark:bg-gray-600 hover:bg-indigo-100 dark:hover:bg-indigo-800"
                                            >
                                                Edit
                                            </button>
                                        )}
                                        {onDeleteSnippet && (
                                            <button
                                                onClick={() => { if (window.confirm(`Delete snippet "${snippet.title}"?`)) onDeleteSnippet(snippet.id); }}
                                                className="px-2 py-1 text-xs font-semibold rounded bg-gray-200 dark:bg-gray-600 hover:bg-red-100 dark:hover:bg-red-800 text-red-600 dark:text-red-400"
                                            >
                                                Delete
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <pre className="bg-gray-800 text-white p-2 rounded text-xs font-mono whitespace-pre-wrap">
                                    <code>{snippet.code}</code>
                                </pre>
                            </div>
                        ))}
                        {(!userSnippets || userSnippets.length === 0) && (
                            <p className="text-xs text-gray-400 italic">No custom snippets yet. Create one to get started.</p>
                        )}
                    </div>
                </details>
            )}

            {SNIPPETS.map(category => {
                const isOpen = categoriesState[category.name] ?? (category.name !== "ATL & Transforms");
                return (
                    <details 
                        key={category.name} 
                        open={isOpen} 
                        className="group"
                        onToggle={(e) => onToggleCategory && onToggleCategory(category.name, (e.currentTarget as HTMLDetailsElement).open)}
                    >
                        <summary className="font-semibold text-gray-600 dark:text-gray-400 cursor-pointer list-none flex items-center">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 transition-transform group-open:rotate-90" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>
                            {category.name}
                        </summary>
                        <div className="pl-4 mt-2 space-y-3">
                            {category.snippets.map(snippet => (
                                <div key={snippet.title} className="p-3 rounded-md bg-gray-50 dark:bg-gray-700/50">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <p className="font-semibold">{snippet.title}</p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{snippet.description}</p>
                                        </div>
                                        <button
                                            onClick={() => handleCopy(snippet.code, snippet.title)}
                                            className={`px-2 py-1 text-xs font-semibold rounded ${copiedSnippet === snippet.title ? 'bg-green-600 text-white' : 'bg-gray-200 dark:bg-gray-600 hover:bg-indigo-100 dark:hover:bg-indigo-800'}`}
                                        >
                                            {copiedSnippet === snippet.title ? 'Copied!' : 'Copy'}
                                        </button>
                                    </div>
                                    <pre className="bg-gray-800 text-white p-2 rounded text-xs font-mono whitespace-pre-wrap">
                                        <code>{snippet.code}</code>
                                    </pre>
                                </div>
                            ))}
                        </div>
                    </details>
                );
            })}
        </div>
    );
};

export default SnippetManager;
