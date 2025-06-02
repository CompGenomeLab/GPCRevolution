import { Download } from 'lucide-react';

interface DownloadableFilesProps {
  tree?: string | null;
  alignment?: string | null;
  conservationFile?: string | null;
}

const DownloadableFiles = ({ tree, alignment, conservationFile }: DownloadableFilesProps) => {
  if (!tree && !alignment && !conservationFile) return null;

  return (
    <div className="bg-card text-card-foreground rounded-lg p-6 shadow-md space-y-4 my-6">
      <h2 className="text-xl font-semibold text-foreground">Downloadable Files</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {tree && (
          <a
            href={`/${tree}`}
            download
            className="flex items-center justify-between p-4 border rounded-md hover:bg-accent"
          >
            <div>
              <p className="font-medium">Phylogenetic Tree</p>
              <p className="text-sm text-muted-foreground">Newick format</p>
            </div>
            <Download className="h-5 w-5" />
          </a>
        )}
        {alignment && (
          <a
            href={`/${alignment}`}
            download
            className="flex items-center justify-between p-4 border rounded-md hover:bg-accent"
          >
            <div>
              <p className="font-medium">Multiple Sequence Alignment</p>
              <p className="text-sm text-muted-foreground">FASTA format</p>
            </div>
            <Download className="h-5 w-5" />
          </a>
        )}
        {conservationFile && (
          <a
            href={`/${conservationFile}`}
            download
            className="flex items-center justify-between p-4 border rounded-md hover:bg-accent"
          >
            <div>
              <p className="font-medium">Conservation Data</p>
              <p className="text-sm text-muted-foreground">Tab-delimited format</p>
            </div>
            <Download className="h-5 w-5" />
          </a>
        )}
      </div>
    </div>
  );
};

export default DownloadableFiles;
