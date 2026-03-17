import { EditorView, Decoration, ViewPlugin, drawSelection, type DecorationSet } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';

const buildSelectionRangeDecorations = (view: EditorView): DecorationSet => {
    const builder = new RangeSetBuilder<Decoration>();

    for (const range of view.state.selection.ranges) {
        if (range.empty) continue;
        builder.add(range.from, range.to, Decoration.mark({ class: 'cm-selectionRange' }));
    }

    return builder.finish();
};

const selectionRangePlugin = ViewPlugin.fromClass(class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
        this.decorations = buildSelectionRangeDecorations(view);
    }

    update(update: { selectionSet: boolean; docChanged: boolean; viewportChanged: boolean; view: EditorView }) {
        if (update.selectionSet || update.docChanged || update.viewportChanged) {
            this.decorations = buildSelectionRangeDecorations(update.view);
        }
    }
}, {
    decorations: (value) => value.decorations
});

const interactiveSelectionTheme = (isDark: boolean) => EditorView.theme({
    '.cm-scroller': {
        position: 'relative'
    },
    '.cm-selectionLayer': {
        zIndex: 3,
        pointerEvents: 'none'
    },
    '.cm-cursorLayer': {
        zIndex: 4,
        pointerEvents: 'none'
    },
    '.cm-content': {
        position: 'relative',
        zIndex: 1
    },
    '.cm-selectionRange': {
        backgroundColor: isDark ? 'rgba(96, 165, 250, 0.16)' : 'rgba(37, 99, 235, 0.16)',
        borderRadius: '2px'
    },
    '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': {
        backgroundColor: `${isDark ? 'rgba(96, 165, 250, 0.30)' : 'rgba(37, 99, 235, 0.26)'} !important`
    },
    '.cm-selectionBackground': {
        backgroundColor: `${isDark ? 'rgba(96, 165, 250, 0.30)' : 'rgba(37, 99, 235, 0.26)'} !important`
    },
    '.cm-content ::selection': {
        backgroundColor: 'transparent !important',
        color: 'inherit !important'
    },
    '.cm-line::selection, .cm-line > span::selection': {
        backgroundColor: 'transparent !important',
        color: 'inherit !important'
    }
});

const readonlySelectionTheme = (isDark: boolean) => EditorView.theme({
    '.cm-selectionRange': {
        backgroundColor: isDark ? 'rgba(96, 165, 250, 0.16)' : 'rgba(37, 99, 235, 0.16)',
        borderRadius: '2px'
    },
    '.cm-content::selection, .cm-content *::selection, .cm-line::selection, .cm-line > span::selection': {
        backgroundColor: `${isDark ? 'rgba(96, 165, 250, 0.30)' : 'rgba(37, 99, 235, 0.26)'} !important`,
        color: `${isDark ? '#eaf2ff' : '#0b1f3a'} !important`
    }
});

export const createInteractiveSelectionExtensions = (isDark: boolean) => [
    drawSelection(),
    selectionRangePlugin,
    interactiveSelectionTheme(isDark)
];

export const createReadonlySelectionExtension = (isDark: boolean) => [
    selectionRangePlugin,
    readonlySelectionTheme(isDark)
];
