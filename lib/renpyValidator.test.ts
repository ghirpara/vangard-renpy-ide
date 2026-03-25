import { describe, it, expect } from 'vitest';
import { validateRenpyCode } from './renpyValidator';

function errors(code: string) {
  return validateRenpyCode(code).filter(d => d.severity === 'error').map(d => d.message);
}

function warnings(code: string) {
  return validateRenpyCode(code).filter(d => d.severity === 'warning').map(d => d.message);
}

// ── show expression ───────────────────────────────────────────────────────

describe('show expression', () => {
  it('flags show expression without as', () => {
    const code = '    show expression some_displayable';
    expect(errors(code)).toHaveLength(1);
    expect(errors(code)[0]).toContain('`show expression` requires an `as <tag>`');
  });

  it('accepts show expression with as', () => {
    expect(errors('    show expression some_displayable as tag')).toHaveLength(0);
  });

  it('does not flag plain show statements', () => {
    expect(errors('    show bg_forest')).toHaveLength(0);
  });
});

// ── play / queue ──────────────────────────────────────────────────────────

describe('play / queue channel', () => {
  it('flags play with file path instead of channel', () => {
    const e = errors('    play "music/theme.ogg"');
    expect(e).toHaveLength(1);
    expect(e[0]).toContain('missing a channel name');
  });

  it('flags queue with file path instead of channel', () => {
    const e = errors('    queue "sound/effect.ogg"');
    expect(e).toHaveLength(1);
    expect(e[0]).toContain('missing a channel name');
  });

  it('accepts play with known channel', () => {
    expect(errors('    play music "theme.ogg"')).toHaveLength(0);
  });

  it('warns on unknown channel', () => {
    const w = warnings('    play ambient "birds.ogg"');
    expect(w).toHaveLength(1);
    expect(w[0]).toContain('Unknown audio channel');
  });

  it('accepts all four built-in channels', () => {
    expect(errors('    play music "a.ogg"\n    play sound "b.ogg"\n    play voice "c.ogg"\n    play audio "d.ogg"')).toHaveLength(0);
  });

  it('flags loop and noloop together', () => {
    const e = errors('    play music "theme.ogg" loop noloop');
    expect(e).toHaveLength(1);
    expect(e[0]).toContain('mutually exclusive');
  });

  it('accepts loop alone', () => {
    expect(errors('    play music "theme.ogg" loop')).toHaveLength(0);
  });
});

// ── stop ─────────────────────────────────────────────────────────────────

describe('stop', () => {
  it('flags bare stop with no channel', () => {
    const e = errors('    stop');
    expect(e).toHaveLength(1);
    expect(e[0]).toContain('requires a channel name');
  });

  it('flags stop with only fadeout (no channel)', () => {
    const e = errors('    stop fadeout 1.0');
    expect(e).toHaveLength(1);
  });

  it('accepts stop with channel', () => {
    expect(errors('    stop music')).toHaveLength(0);
    expect(errors('    stop music fadeout 1.0')).toHaveLength(0);
  });
});

// ── define / default ──────────────────────────────────────────────────────

describe('define / default', () => {
  it('flags define without assignment', () => {
    const e = errors('define foo');
    expect(e).toHaveLength(1);
    expect(e[0]).toContain('missing an assignment');
  });

  it('flags default without assignment', () => {
    const e = errors('default score');
    expect(e).toHaveLength(1);
    expect(e[0]).toContain('missing an assignment');
  });

  it('accepts define with assignment', () => {
    expect(errors('define foo = "bar"')).toHaveLength(0);
  });

  it('accepts default with assignment', () => {
    expect(errors('default score = 0')).toHaveLength(0);
  });

  it('accepts define with dotted name', () => {
    expect(errors('define audio.theme = "music/theme.ogg"')).toHaveLength(0);
  });
});

// ── missing colon ─────────────────────────────────────────────────────────

describe('missing colon', () => {
  it('flags label without colon', () => {
    const e = errors('label start');
    expect(e).toHaveLength(1);
    expect(e[0]).toContain("missing its colon");
  });

  it('accepts label with colon', () => {
    expect(errors('label start:')).toHaveLength(0);
  });

  it('flags screen without colon', () => {
    const e = errors('screen hud');
    expect(e).toHaveLength(1);
    expect(e[0]).toContain("missing its colon");
  });

  it('accepts screen with params and colon', () => {
    expect(errors('screen hud(player):')).toHaveLength(0);
  });

  it('flags bare menu keyword', () => {
    const e = errors('    menu');
    expect(e).toHaveLength(1);
    expect(e[0]).toContain('menu');
  });

  it('accepts menu with colon', () => {
    expect(errors('    menu:')).toHaveLength(0);
  });

  it('flags transform without colon', () => {
    const e = errors('transform slide_in');
    expect(e).toHaveLength(1);
    expect(e[0]).toContain("missing its colon");
  });
});

// ── image reserved words ──────────────────────────────────────────────────

describe('image reserved words', () => {
  it('flags image name containing reserved word', () => {
    const e = errors('image eileen with happy = "eileen_happy.png"');
    expect(e).toHaveLength(1);
    expect(e[0]).toContain('reserved Ren\'Py keyword');
  });

  it('flags each reserved word', () => {
    for (const word of ['at', 'as', 'behind', 'onlayer', 'with', 'zorder']) {
      const code = `image char ${word} happy = "file.png"`;
      expect(errors(code).length).toBeGreaterThan(0);
    }
  });

  it('accepts normal image names', () => {
    expect(errors('image eileen happy = "eileen_happy.png"')).toHaveLength(0);
    expect(errors('image bg forest:')).toHaveLength(0);
  });
});

// ── menu choice condition ─────────────────────────────────────────────────

describe('menu choice condition', () => {
  it('flags parenthesized boolean condition without if', () => {
    const code = '    "Yes, it is mine." ($mook==1):';
    const w = warnings(code);
    expect(w).toHaveLength(1);
    expect(w[0]).toContain('missing the `if` keyword');
  });

  it('flags bare condition without if', () => {
    const code = '    "Choice text" $flag:';
    const w = warnings(code);
    expect(w).toHaveLength(1);
    expect(w[0]).toContain('missing the `if` keyword');
  });

  it('accepts standard if condition', () => {
    expect(warnings('    "Yes, it is mine." if mook == 1:')).toHaveLength(0);
  });

  it('accepts choice with no condition', () => {
    expect(warnings('    "A simple choice":')).toHaveLength(0);
  });

  it('does not flag menu arguments (keyword=value)', () => {
    // (arg=value) is valid menu argument syntax, not a condition
    expect(warnings('    "Choice with args" (some_arg=True):')).toHaveLength(0);
  });

  it('flags menu choice missing trailing colon', () => {
    const e = errors('    "Yes, it is mine." ($mook==1)');
    expect(e).toHaveLength(1);
    expect(e[0]).toContain('missing its trailing colon');
  });

  it('does not flag bare narration line without colon', () => {
    expect(errors('    "Just some narration."')).toHaveLength(0);
  });
});

// ── python block skipping ─────────────────────────────────────────────────

describe('python block skipping', () => {
  it('does not flag valid Python inside python block', () => {
    const code = `python:
    stop = True
    label = "something"
    define = lambda x: x`;
    expect(errors(code)).toHaveLength(0);
  });

  it('does not flag inline python ($)', () => {
    expect(errors('    $ stop = True')).toHaveLength(0);
    expect(errors('    $ label = "foo"')).toHaveLength(0);
  });

  it('resumes validation after python block ends', () => {
    const code = `python:
    x = 1
label broken`;
    const e = errors(code);
    expect(e).toHaveLength(1);
    expect(e[0]).toContain('missing its colon');
  });
});

// ── bare statements ────────────────────────────────────────────────────────

describe('bare statements', () => {
  it('flags bare jump', () => {
    const e = errors('    jump');
    expect(e).toHaveLength(1);
    expect(e[0]).toContain('requires a label name');
  });

  it('accepts jump with target', () => {
    expect(errors('    jump chapter_two')).toHaveLength(0);
  });

  it('accepts jump expression (dynamic)', () => {
    expect(errors('    jump expression next_label')).toHaveLength(0);
  });

  it('flags bare call', () => {
    const e = errors('    call');
    expect(e).toHaveLength(1);
    expect(e[0]).toContain('requires a label or screen name');
  });

  it('accepts call with target', () => {
    expect(errors('    call my_subroutine')).toHaveLength(0);
  });

  it('flags bare show', () => {
    const e = errors('    show');
    expect(e).toHaveLength(1);
    expect(e[0]).toContain('requires an image or screen name');
  });

  it('accepts show with image', () => {
    expect(errors('    show eileen happy')).toHaveLength(0);
  });

  it('flags bare hide', () => {
    const e = errors('    hide');
    expect(e).toHaveLength(1);
    expect(e[0]).toContain('requires an image or screen name');
  });

  it('accepts hide with image', () => {
    expect(errors('    hide eileen')).toHaveLength(0);
  });

  it('flags bare with', () => {
    const e = errors('    with');
    expect(e).toHaveLength(1);
    expect(e[0]).toContain('requires a transition');
  });

  it('accepts with transition', () => {
    expect(errors('    with dissolve')).toHaveLength(0);
    expect(errors('    with None')).toHaveLength(0);
  });

  it('flags bare voice', () => {
    const e = errors('    voice');
    expect(e).toHaveLength(1);
    expect(e[0]).toContain('requires a file path string or keyword');
  });

  it('accepts voice with file', () => {
    expect(errors('    voice "lines/hello.ogg"')).toHaveLength(0);
  });

  it('accepts voice with valid keywords', () => {
    expect(errors('    voice sustain')).toHaveLength(0);
    expect(errors('    voice silence')).toHaveLength(0);
    expect(errors('    voice stop')).toHaveLength(0);
  });
});

// ── screen commands ────────────────────────────────────────────────────────

describe('screen commands', () => {
  it('flags call screen without name', () => {
    const e = errors('    call screen');
    expect(e).toHaveLength(1);
    expect(e[0]).toContain('requires a screen name');
  });

  it('accepts call screen with name', () => {
    expect(errors('    call screen inventory')).toHaveLength(0);
  });

  it('flags show screen without name', () => {
    const e = errors('    show screen');
    expect(e).toHaveLength(1);
    expect(e[0]).toContain('requires a screen name');
  });

  it('accepts show screen with name', () => {
    expect(errors('    show screen hud')).toHaveLength(0);
  });

  it('flags hide screen without name', () => {
    const e = errors('    hide screen');
    expect(e).toHaveLength(1);
    expect(e[0]).toContain('requires a screen name');
  });

  it('accepts hide screen with name', () => {
    expect(errors('    hide screen hud')).toHaveLength(0);
  });
});

// ── window / nvl ───────────────────────────────────────────────────────────

describe('window statement', () => {
  it('flags bare window', () => {
    const e = errors('    window');
    expect(e).toHaveLength(1);
    expect(e[0]).toContain('requires show, hide, or auto');
  });

  it('flags window with unknown keyword', () => {
    const e = errors('    window open');
    expect(e).toHaveLength(1);
    expect(e[0]).toContain('Unknown');
  });

  it('accepts window show / hide / auto', () => {
    expect(errors('    window show')).toHaveLength(0);
    expect(errors('    window hide')).toHaveLength(0);
    expect(errors('    window auto')).toHaveLength(0);
  });
});

describe('nvl statement', () => {
  it('flags bare nvl', () => {
    const e = errors('    nvl');
    expect(e).toHaveLength(1);
    expect(e[0]).toContain('requires clear, show, or hide');
  });

  it('flags nvl with unknown keyword', () => {
    const e = errors('    nvl reset');
    expect(e).toHaveLength(1);
    expect(e[0]).toContain('Unknown');
  });

  it('accepts nvl clear / show / hide', () => {
    expect(errors('    nvl clear')).toHaveLength(0);
    expect(errors('    nvl show')).toHaveLength(0);
    expect(errors('    nvl hide')).toHaveLength(0);
  });
});

// ── init block ─────────────────────────────────────────────────────────────

describe('init block colon', () => {
  it('flags bare init without colon', () => {
    const e = errors('init');
    expect(e).toHaveLength(1);
    expect(e[0]).toContain('missing its colon');
  });

  it('flags init python without colon', () => {
    const e = errors('init python');
    expect(e).toHaveLength(1);
    expect(e[0]).toContain('missing its colon');
  });

  it('flags init with offset but no colon', () => {
    const e = errors('init 5');
    expect(e).toHaveLength(1);
    expect(e[0]).toContain('missing its colon');
  });

  it('accepts init with colon', () => {
    expect(errors('init:')).toHaveLength(0);
    expect(errors('init python:')).toHaveLength(0);
    expect(errors('init 5:')).toHaveLength(0);
  });
});

// ── inline Python ──────────────────────────────────────────────────────────

describe('inline Python ($)', () => {
  it('flags empty $ expression', () => {
    const e = errors('    $');
    expect(e).toHaveLength(1);
    expect(e[0]).toContain('Empty inline Python expression');
  });

  it('accepts valid $ assignment', () => {
    expect(errors('    $ score = 0')).toHaveLength(0);
    expect(errors('    $ flag = True')).toHaveLength(0);
  });

  it('warns on $ var == value (comparison as statement)', () => {
    const w = warnings('    $ score == 0');
    expect(w).toHaveLength(1);
    expect(w[0]).toContain('comparison expression');
  });

  it('does not warn on $ assert x == y', () => {
    expect(warnings('    $ assert score == 0')).toHaveLength(0);
  });

  it('does not warn on $ True == True', () => {
    expect(warnings('    $ True == True')).toHaveLength(0);
  });
});

// ── pause ──────────────────────────────────────────────────────────────────

describe('pause statement', () => {
  it('warns on pause with string argument', () => {
    const w = warnings('    pause "1.0"');
    expect(w).toHaveLength(1);
    expect(w[0]).toContain('numeric duration');
  });

  it('accepts bare pause', () => {
    expect(errors('    pause')).toHaveLength(0);
  });

  it('accepts pause with numeric duration', () => {
    expect(errors('    pause 1.0')).toHaveLength(0);
    expect(errors('    pause 2')).toHaveLength(0);
  });

  it('accepts pause with expression', () => {
    expect(errors('    pause config.default_pause_time')).toHaveLength(0);
  });
});
