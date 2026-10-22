// Login Page
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { LogIn } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { roleHome } from '../../utils/roleHome';
import { Button } from '@avc/ui/components/Button';
import { Input } from '@avc/ui/components/Input';
import { Card } from '@avc/ui/components/Card';
import { Loader } from '../../components/Loader';

const loginSchema = z.object({
  email: z.string().email('Ogiltig e-postadress'),
  password: z.string().min(8, 'Lösenord måste vara minst 8 tecken'),
});

type LoginForm = z.infer<typeof loginSchema>;

export function LoginPage() {
  const navigate = useNavigate();
  const { login, isLoading } = useAuthStore();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: 'admin@avc.local', password: 'admin123' },
  });

  const onSubmit = async (data: LoginForm) => {
    setError(null);
    try {
      await login(data.email, data.password);
      navigate(roleHome(useAuthStore.getState().user?.role), { replace: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Inloggning misslyckades';
      setError(message);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <Card className="w-full max-w-md p-8">
        <div className="text-center mb-8">
          <div className="mx-auto w-16 h-16 bg-primary-100 rounded-2xl flex items-center justify-center mb-4">
            <LogIn className="w-8 h-8 text-primary-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">AVC Management</h1>
          <p className="text-gray-500 mt-1">Logga in för att fortsätta</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm" role="alert">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input
            label="E-post"
            type="email"
            {...register('email')}
            error={errors.email?.message}
            placeholder="din@email.se"
            autoComplete="email"
            disabled={isLoading || isSubmitting}
          />

          <Input
            label="Lösenord"
            type="password"
            {...register('password')}
            error={errors.password?.message}
            placeholder="••••••••"
            autoComplete="current-password"
            disabled={isLoading || isSubmitting}
          />

          <Button type="submit" className="w-full" loading={isLoading || isSubmitting}>
            Logga in
          </Button>
        </form>

        <div className="mt-6 text-center text-sm text-gray-500">
          <p>Demo-inloggningar:</p>
          <div className="mt-2 space-y-1 text-xs font-mono bg-gray-50 p-3 rounded">
            <div>Admin: admin@avc.local / admin123</div>
            <div>Förare: driver1@avc.local / driver123</div>
            <div>Arbetare: worker1@avc.local / worker123</div>
          </div>
        </div>
      </Card>
    </div>
  );
}