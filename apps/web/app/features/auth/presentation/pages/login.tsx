import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Navigate, Link } from 'react-router';
import {
	Card,
	CardContent,
	CardFooter,
	CardHeader,
	CardTitle,
} from '~/core/components/ui/card';
import { Button } from '~/core/components/ui/button';
import { Input } from '~/core/components/ui/input';
import {
	Field,
	FieldError,
	FieldGroup,
	FieldLabel,
} from '~/core/components/ui/field';
import { useLogin } from '../hooks/use-auth-mutations';
import { authErrorMessage, useGuestOnly } from '../hooks/use-guest-only';
import { loginSchema, type LoginDto } from '../../domain/dtos/login.dto';

const formId = 'login-form';

export function Login() {
	const guard = useGuestOnly();
	const login = useLogin();
	const {
		register,
		handleSubmit,
		formState: { errors },
	} = useForm<LoginDto>({
		resolver: zodResolver(loginSchema),
		defaultValues: {
			email: '',
			password: '',
		},
	});

	/*
	 * Tidak ada `navigate()` di mana pun pada berkas ini, dan itu disengaja.
	 * `useLogin` menaruh sesi baru ke cache, `useGuestOnly` melihatnya pada
	 * render berikutnya lalu berubah jadi `denied` — cabang di bawah yang
	 * mengantar. Jalur keluar halaman ini jadi satu, dipakai bersama oleh
	 * "baru saja berhasil masuk" dan "membuka /login padahal sudah punya sesi",
	 * sehingga tidak ada versi kedua yang bisa lupa menghormati `?next=` atau
	 * mengirim Penyusun ke dashboard yang bukan haknya.
	 */
	if (guard.status === 'pending') {
		return (
			<div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
				Memuat…
			</div>
		);
	}

	if (guard.status === 'denied') {
		return <Navigate to={guard.redirectTo} replace />;
	}

	const formError = authErrorMessage(login.error, 'Gagal masuk. Coba lagi.');

	return (
		<div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
			<Card className="w-full max-w-md">
				<CardHeader>
					<CardTitle>Login</CardTitle>
				</CardHeader>
				<CardContent>
					<form
						id={formId}
						onSubmit={handleSubmit((data) => login.mutate(data))}
					>
						<FieldGroup>
							{formError && (
								<p className="text-sm text-destructive">{formError}</p>
							)}
							<Field data-invalid={!!errors.email}>
								<FieldLabel htmlFor="email">Email</FieldLabel>
								<Input
									id="email"
									type="email"
									placeholder="name@example.com"
									aria-invalid={!!errors.email}
									disabled={login.isPending}
									{...register('email')}
								/>
								{errors.email && (
									<FieldError>{errors.email.message}</FieldError>
								)}
							</Field>

							<Field data-invalid={!!errors.password}>
								<FieldLabel htmlFor="password">Password</FieldLabel>
								<Input
									id="password"
									type="password"
									placeholder="••••••"
									aria-invalid={!!errors.password}
									disabled={login.isPending}
									{...register('password')}
								/>
								{errors.password && (
									<FieldError>{errors.password.message}</FieldError>
								)}
							</Field>
						</FieldGroup>
					</form>
				</CardContent>

				<CardFooter className="flex flex-col gap-4">
					<Button
						className="w-full"
						type="submit"
						disabled={login.isPending}
						form={formId}
					>
						{login.isPending ? 'Loading...' : 'Masuk'}
					</Button>
					<p className="text-center text-sm text-muted-foreground">
						Belum punya akun?{' '}
						<Link to="/register" className="text-primary hover:underline">
							Daftar
						</Link>
					</p>
				</CardFooter>
			</Card>
		</div>
	);
}
