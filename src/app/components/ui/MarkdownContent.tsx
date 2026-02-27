import React from 'react';

interface MarkdownContentProps {
    markdown: string;
    className?: string;
    emptyText?: string;
}

const escapeHtml = (input: string) =>
    input
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

const sanitizeUrl = (url: string) => {
    const trimmed = url.trim();
    if (!trimmed) return '#';
    if (/^(https?:|mailto:|tel:)/i.test(trimmed)) return trimmed;
    return '#';
};

const renderInline = (input: string) => {
    let safe = escapeHtml(input);

    safe = safe.replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-[0.9em]">$1</code>');
    safe = safe.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    safe = safe.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    safe = safe.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label: string, url: string) => {
        const href = sanitizeUrl(url);
        return `<a class="text-blue-600 dark:text-blue-400 underline underline-offset-2" href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    });

    return safe;
};

const markdownToHtml = (markdown: string) => {
    const lines = markdown.replace(/\r\n/g, '\n').split('\n');
    const out: string[] = [];
    let inUl = false;
    let inOl = false;

    const closeLists = () => {
        if (inUl) {
            out.push('</ul>');
            inUl = false;
        }
        if (inOl) {
            out.push('</ol>');
            inOl = false;
        }
    };

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) {
            closeLists();
            continue;
        }

        const heading = line.match(/^(#{1,6})\s+(.+)$/);
        if (heading) {
            closeLists();
            const level = heading[1].length;
            out.push(`<h${level} class="font-bold ${level <= 2 ? 'text-lg' : level === 3 ? 'text-base' : 'text-sm'} mt-2 mb-1">${renderInline(heading[2])}</h${level}>`);
            continue;
        }

        const blockquote = line.match(/^>\s?(.+)$/);
        if (blockquote) {
            closeLists();
            out.push(`<blockquote class="border-l-2 border-slate-300 dark:border-slate-600 pl-3 italic text-slate-600 dark:text-slate-300 my-1">${renderInline(blockquote[1])}</blockquote>`);
            continue;
        }

        const unordered = line.match(/^[-*+]\s+(.+)$/);
        if (unordered) {
            if (inOl) {
                out.push('</ol>');
                inOl = false;
            }
            if (!inUl) {
                out.push('<ul class="list-disc list-inside space-y-1 my-1">');
                inUl = true;
            }
            out.push(`<li>${renderInline(unordered[1])}</li>`);
            continue;
        }

        const ordered = line.match(/^\d+\.\s+(.+)$/);
        if (ordered) {
            if (inUl) {
                out.push('</ul>');
                inUl = false;
            }
            if (!inOl) {
                out.push('<ol class="list-decimal list-inside space-y-1 my-1">');
                inOl = true;
            }
            out.push(`<li>${renderInline(ordered[1])}</li>`);
            continue;
        }

        if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
            closeLists();
            out.push('<hr class="my-2 border-slate-200 dark:border-slate-700" />');
            continue;
        }

        closeLists();
        out.push(`<p class="my-1">${renderInline(line)}</p>`);
    }

    closeLists();
    return out.join('');
};

export const MarkdownContent: React.FC<MarkdownContentProps> = ({ markdown, className = '', emptyText = '' }) => {
    const content = markdown.trim();
    if (!content) {
        return <div className={className}>{emptyText}</div>;
    }
    return (
        <div
            className={className}
            dangerouslySetInnerHTML={{ __html: markdownToHtml(content) }}
        />
    );
};

