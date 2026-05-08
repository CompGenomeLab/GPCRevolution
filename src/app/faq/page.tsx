'use client';

import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import RootContainer from '@/components/RootContainer';

const faqs: { question: string; answer: React.ReactNode }[] = [
  {
    question: 'How can I access the data?',
    answer: (
      <>
        Our website is located at our{' '}
        <Link
          href="https://github.com/CompGenomeLab/GPCRevolution"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-foreground"
        >
          GitHub repository
        </Link>{' '}
        and all the data is freely available.
      </>
    ),
  },
  {
    question: 'How were conservation scores calculated?',
    answer:
      'We calculate conservation percentage by removing gaps and applying a similarity measure. For each position, we first calculate the gap percentage. If the gaps are the most frequent, we assign 0% conservation to the corresponding position. If not we count the most frequent amino acid and add other amino acid(s) that give a BLOSUM80 score greater than 1. The count of similar amino acids are divided by the number of non-gap sequences.',
  },
  {
    question: 'How were divergent orthologs identified?',
    answer:
      'Divergent sequences were manually identified by examining features such as missing transmembrane regions and regions of extreme or unexpected sequence divergence. N- and C-terminal regions were mainly excluded from this analysis. We welcome community feedback to help improve the divergent ortholog set — if you have suggestions or corrections, please reach out to us.',
  },
  {
    question: 'What is the header format for protein sequences?',
    answer: 'sp: Swiss-Prot / tr: TrEMBL|Uniprot Protein ID|Gene Name _ Species Name|Tax ID',
  },
];

export default function FAQPage() {
  return (
    <RootContainer className="max-w-2xl">
      <h1 className="text-3xl font-bold text-foreground">Frequently Asked Questions</h1>
      <div className="space-y-3">
        {faqs.map(({ question, answer }) => (
          <details
            key={question}
            className="group rounded-lg bg-card text-card-foreground shadow-md"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-8 py-5 select-none">
              <h2 className="text-xl font-semibold text-foreground">{question}</h2>
              <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
            </summary>
            <div className="px-8 pb-6">
              <p className="text-muted-foreground">{answer}</p>
            </div>
          </details>
        ))}
      </div>
    </RootContainer>
  );
}
