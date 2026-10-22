// Settings Page
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../utils/api';
import { Card } from '@avc/ui/components/Card';
import { Button } from '@avc/ui/components/Button';
import { Input } from '@avc/ui/components/Input';
import { Select } from '@avc/ui/components/Select';
import { Loader } from '../../components/Loader';
import { User, Shield, Bell, Database, Save } from 'lucide-react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { User as UserType } from '@avc/shared-types';
import { useAuthStore } from '../../stores/authStore';

const profileFormSchema = z.object({
  full_name: z.string().min(1, 'Namn krävs'),
  email: z.string().email('Ogiltig e-post'),
  site_id: z.string().uuid().optional(),
  avatar_url: z.string().url().optional().or(z.literal('')),
});

const passwordFormSchema = z.object({
  current_password: z.string().min(1, 'Nuvarande lösenord krävs'),
  new_password: z.string().min(8, 'Nytt lösenord måste vara minst 8 tecken'),
  confirm_password: z.string(),
}).refine((data) => data.new_password === data.confirm_password, {
  message: 'Lösenorden matchar inte',
  path: ['confirm_password'],
});

type ProfileForm = z.infer<typeof profileFormSchema>;
type PasswordForm = z.infer<typeof passwordFormSchema>;

export function SettingsPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'profile' | 'password' | 'preferences'>('profile');

  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => api.get('/auth/me').then((r) => r.data),
    enabled: !!user,
  });

  const profileForm = useForm<ProfileForm>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      full_name: currentUser?.full_name || '',
      email: currentUser?.email || '',
      site_id: currentUser?.site_id || '',
      avatar_url: currentUser?.avatar_url || '',
    },
  });

  const passwordForm = useForm<PasswordForm>({
    resolver: zodResolver(passwordFormSchema),
    defaultValues: {
      current_password: '',
      new_password: '',
      confirm_password: '',
    },
  });

  const profileMutation = useMutation({
    mutationFn: (data: ProfileForm) => api.patch('/auth/me', data),
    onSuccess: (updatedUser: any) => {
      queryClient.setQueryData(['currentUser'], updatedUser);
      useAuthStore.getState().setUser(updatedUser);
    },
  });

  const passwordMutation = useMutation({
    mutationFn: (data: PasswordForm) => api.post('/auth/change-password', {
      current_password: data.current_password,
      new_password: data.new_password,
    }),
    onSuccess: () => {
      passwordForm.reset();
    },
  });

  const handleProfileSubmit = (data: ProfileForm) => {
    profileMutation.mutate(data);
  };

  const handlePasswordSubmit = (data: PasswordForm) => {
    passwordMutation.mutate(data);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Inställningar</h1>

      <div className="flex border-b mb-6">
        {(['profile', 'password', 'preferences'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab === 'profile' && <span className="flex items-center gap-2"><User className="w-4 h-4" /> Profil</span>}
            {tab === 'password' && <span className="flex items-center gap-2"><Shield className="w-4 h-4" /> Lösenord</span>}
            {tab === 'preferences' && <span className="flex items-center gap-2"><Bell className="w-4 h-4" /> Preferenser</span>}
          </button>
        ))}
      </div>

      {activeTab === 'profile' && (
        <Card>
          <h2 className="text-lg font-semibold mb-4">Profiluppgifter</h2>
          <form onSubmit={profileForm.handleSubmit(handleProfileSubmit)} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Namn</label>
                <Input {...profileForm.register('full_name')} placeholder="Ditt namn" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">E-post</label>
                <Input type="email" {...profileForm.register('email')} placeholder="din@epost.se" disabled />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Plats</label>
                <Select
                  {...profileForm.register('site_id')}
                  options={[]}
                  placeholder="Välj plats (valfritt)"
                  value={profileForm.watch('site_id')}
                  onChange={(e) => profileForm.setValue('site_id', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Avatar URL</label>
                <Input {...profileForm.register('avatar_url')} placeholder="https://..." />
              </div>
            </div>
            <div className="flex justify-end pt-4 border-t">
              <Button type="submit" disabled={profileMutation.isPending} loading={profileMutation.isPending} icon={<Save className="w-4 h-4" />}>
                Spara ändringar
              </Button>
            </div>
          </form>
        </Card>
      )}

      {activeTab === 'password' && (
        <Card>
          <h2 className="text-lg font-semibold mb-4">Ändra lösenord</h2>
          <form onSubmit={passwordForm.handleSubmit(handlePasswordSubmit)} className="space-y-4 max-w-md">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nuvarande lösenord</label>
              <Input type="password" {...passwordForm.register('current_password')} placeholder="Nuvarande lösenord" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nytt lösenord</label>
              <Input type="password" {...passwordForm.register('new_password')} placeholder="Nytt lösenord (min 8 tecken)" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Bekräfta nytt lösenord</label>
              <Input type="password" {...passwordForm.register('confirm_password')} placeholder="Bekräfta lösenord" />
            </div>
            <div className="flex justify-end pt-4 border-t">
              <Button type="submit" disabled={passwordMutation.isPending} loading={passwordMutation.isPending} icon={<Save className="w-4 h-4" />}>
                Ändra lösenord
              </Button>
            </div>
          </form>
        </Card>
      )}

      {activeTab === 'preferences' && (
        <Card>
          <h2 className="text-lg font-semibold mb-4">Preferenser</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="font-medium">E-postnotifieringar</p>
                <p className="text-sm text-gray-500">Få e-post vid nya transportorder och varningar</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" defaultChecked />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="font-medium">Push-notifieringar</p>
                <p className="text-sm text-gray-500">Få push-meddelanden i appen</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" defaultChecked />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="font-medium">Mörkt läge</p>
                <p className="text-sm text-gray-500">Använd mörkt tema</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="font-medium">Språk</p>
                <p className="text-sm text-gray-500">Välj språk för gränssnittet</p>
              </div>
              <Select
                options={[
                  { value: 'sv', label: 'Svenska' },
                  { value: 'en', label: 'English' },
                ]}
                placeholder="Välj språk"
                defaultValue="sv"
              />
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}