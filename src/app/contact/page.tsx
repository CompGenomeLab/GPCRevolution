import Container from '@/components/Container';

export default function ContactPage() {
  return (
    <Container>
      <h1 className="text-3xl font-bold text-foreground text-left">Contact Us</h1>
      <div className="bg-card text-card-foreground rounded-lg p-8 shadow-md text-left space-y-4">
        <p className="text-lg text-muted-foreground">
          For any inquiries, please contact us via email.
        </p>
        <a
          href="mailto:selcuk.1@osu.edu"
          className="inline-block bg-primary text-primary-foreground py-2 px-6 rounded-md hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 transition-colors dark:bg-primary dark:text-background"
        >
          selcuk.1@osu.edu
        </a>
      </div>
    </Container>
  );
}
