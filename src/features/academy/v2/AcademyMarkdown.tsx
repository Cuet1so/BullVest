import type { ReactNode } from 'react';

function inline(text: string): ReactNode {
  return text.split('**').map((part, index) => (
    index % 2 === 1 ? <strong key={index} className="font-semibold text-zinc-100">{part}</strong> : part
  ));
}

export function AcademyMarkdown({ content }: { content: string }) {
  const blocks = content.replaceAll('\r\n', '\n').trim().split(/\n\s*\n/);

  return (
    <article className="space-y-5 text-base leading-8 text-zinc-300">
      {blocks.map((block, index) => {
        const lines = block.split('\n');
        const first = lines[0]?.trim() ?? '';

        if (first.startsWith('### ')) {
          return <h3 key={index} className="pt-3 text-lg font-bold text-white">{inline(first.slice(4))}</h3>;
        }
        if (first.startsWith('## ')) {
          return <h2 key={index} className="pt-6 text-xl font-bold text-white">{inline(first.slice(3))}</h2>;
        }
        if (first.startsWith('# ')) {
          return <h1 key={index} className="pt-4 text-2xl font-bold text-white">{inline(first.slice(2))}</h1>;
        }
        if (lines.every((line) => line.trim().startsWith('- '))) {
          return <ul key={index} className="ml-5 list-disc space-y-1 pl-2">{lines.map((line, item) => (
            <li key={item}>{inline(line.trim().slice(2))}</li>
          ))}</ul>;
        }
        if (first.startsWith('$$') && first.endsWith('$$')) {
          return <div key={index} className="overflow-x-auto rounded-xl border border-emerald-500/20 bg-emerald-950/20 px-5 py-4 text-center font-mono text-emerald-200">{first.slice(2, -2).replaceAll('\\ ', ' ')}</div>;
        }
        if (lines.length >= 2 && lines.every((line) => line.trim().startsWith('|'))) {
          const tableRows = lines.map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()));
          const dataRows = tableRows.filter((row) => !row.every((cell) => /^:?-{2,}:?$/.test(cell)));
          return <div key={index} className="overflow-x-auto rounded-xl border border-zinc-800"><table className="w-full text-left text-sm">
            <thead className="bg-zinc-900"><tr>{dataRows[0]?.map((cell, cellIndex) => (
              <th key={cellIndex} className="border-b border-zinc-800 px-4 py-3 text-zinc-200">{inline(cell)}</th>
            ))}</tr></thead>
            <tbody>{dataRows.slice(1).map((row, rowIndex) => <tr key={rowIndex} className="border-t border-zinc-800/60">{row.map((cell, cellIndex) => (
              <td key={cellIndex} className="px-4 py-3">{inline(cell)}</td>
            ))}</tr>)}</tbody>
          </table></div>;
        }
        if (first.startsWith('> ')) {
          return <blockquote key={index} className="border-l-2 border-emerald-400 pl-4 italic text-zinc-400">{inline(first.slice(2))}</blockquote>;
        }
        return <p key={index} className="whitespace-pre-line">{inline(block)}</p>;
      })}
    </article>
  );
}
