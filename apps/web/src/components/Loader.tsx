import { LoadingSpinner } from '@avc/ui/components/LoadingSpinner';

interface LoaderProps {
  message?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  fullScreen?: boolean;
}

export function Loader({ message = 'Laddar...', size = 'md', fullScreen = false }: LoaderProps) {
  if (fullScreen) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/80">
        <div className="flex flex-col items-center gap-4 p-6 bg-white rounded-xl shadow-lg">
          <LoadingSpinner size={size} />
          <p className="text-gray-600">{message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center py-12">
      <div className="flex flex-col items-center gap-3">
        <LoadingSpinner size={size} />
        <p className="text-gray-500 text-sm">{message}</p>
      </div>
    </div>
  );
}

export function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <Loader size="lg" message="Laddar sida..." />
    </div>
  );
}