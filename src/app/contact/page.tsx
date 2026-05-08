import RootContainer from '@/components/RootContainer';

const contacts = [
  {
    name: 'Berkay Selçuk',
    role: 'Database Developer & Maintainer',
    email: 'selcuk.1@osu.edu',
  },
  {
    name: 'Dr. Ogün Adebali',
    role: 'Academic Advisor',
    email: 'oadebali@sabanciuniv.edu',
  },
];

export default function ContactPage() {
  return (
    <RootContainer className="max-w-2xl">
      <h1 className="text-3xl font-bold text-foreground text-left">Contact Us</h1>
      <div className="bg-card text-card-foreground rounded-lg p-8 shadow-md text-left space-y-6">
        <p className="text-lg text-muted-foreground">
          For any inquiries, please reach out to us via email.
        </p>
        <div className="space-y-4">
          {contacts.map(({ name, role, email }) => (
            <div key={email} className="flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <p className="font-semibold text-foreground">{name}</p>
                <p className="text-sm text-muted-foreground">{role}</p>
              </div>
              <a
                href={`mailto:${email}`}
                className="shrink-0 bg-primary text-primary-foreground py-2 px-6 rounded-md hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 transition-colors text-sm"
              >
                {email}
              </a>
            </div>
          ))}
        </div>
      </div>
    </RootContainer>
  );
}
