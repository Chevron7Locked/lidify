import { Card } from '@/components/ui/Card';

interface ArtistBioProps {
  bio: string;
}

export function ArtistBio({ bio }: ArtistBioProps) {
  if (!bio) return null;

  return (
    <section>
      <h2 className="text-2xl md:text-3xl font-bold mb-6">About</h2>
      <Card className="p-4 md:p-6">
        <div
          className="prose prose-sm md:prose-base prose-invert max-w-none leading-relaxed"
          style={{ color: '#b3b3b3' }}
          dangerouslySetInnerHTML={{ __html: bio }}
        />
      </Card>
    </section>
  );
}
