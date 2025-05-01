import { Container } from '@/components/container';

export default function FAQPage() {
  return (
    <Container>
      <h1 className="text-3xl font-bold text-foreground">Frequently Asked Questions</h1>
      <div className="bg-card text-card-foreground rounded-lg p-8 shadow-md space-y-4">
        <h2 className="text-xl font-semibold text-foreground">How can I access to the data?</h2>
        <p className="text-muted-foreground">
          Our website is located at our GitHub repository and all the data is freely available.
        </p>
      </div>
      <div className="bg-card text-card-foreground rounded-lg p-8 shadow-md space-y-4">
        <h2 className="text-xl font-semibold text-foreground">
          How did conservation scores calculated?
        </h2>
        <p className="text-muted-foreground">
          We calculate conservation percentage by removing gaps and applying a similarity measure.
          For each position, we first calculate the gap percentage. If the gaps are the most
          frequent, we assinging 0% conservation to the corresponding position. If not we count the
          most frequent amino acid and add other amino acid(s) that give a BLOSUM80 score greater
          than 1. The count of similar amino acids are divided by the number of non-gap sequences.
        </p>
      </div>
      <div className="bg-card text-card-foreground rounded-lg p-8 shadow-md space-y-4">
        <h2 className="text-xl font-semibold text-foreground">
          What is the header format for protein sequences?
        </h2>
        <p className="text-muted-foreground">
          sp: Swiss-Prot / tr: TrEMBL|Uniprot Protein ID|Gene Name _ Species Name|Tax ID
        </p>
      </div>
    </Container>
  );
}
