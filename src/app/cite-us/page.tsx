import { Container } from '@/components/container';

export default function CiteUsPage() {
  return (
    <Container>
      <h1 className="text-3xl font-bold text-foreground text-left">Cite Us</h1>
      <div className="bg-card text-card-foreground rounded-lg p-8 shadow-md text-left">
        <p className="text-lg text-muted-foreground">This page will be updated upon publication.</p>
      </div>
    </Container>
  );
}
