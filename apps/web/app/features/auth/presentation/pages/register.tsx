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
import { useRegister } from '../hooks/use-auth-mutations';
import { authErrorMessage, useGuestOnly } from '../hooks/use-guest-only';
import {
	registerSchema,
	type RegisterDto,
} from '../../domain/dtos/register.dto';

const formId = 'register-form';

export function Register() {
	const guard = useGuestOnly();
	const registerAccount = useRegister();
	const {
		register,
		handleSubmit,
		formState: { errors },
	} = useForm<RegisterDto>({
		resolver: zodResolver(registerSchema),
		defaultValues: {
			fullname: '',
			email: '',
			password: '',
			universityName: '',
		},
	});

	// Pengalihan setelah berhasil ditangani cabang `denied` di bawah — lihat
	// catatan di `login.tsx`.
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

	const formError = authErrorMessage(
		registerAccount.error,
		'Gagal mendaftar. Coba lagi.',
	);

	return (
		<div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
			<Card className="w-full max-w-md">
				<CardHeader>
					<CardTitle>Registrasi</CardTitle>
				</CardHeader>

				<CardContent>
					<form
						id={formId}
						onSubmit={handleSubmit((data) =>
							// Registrasi selalu membuat tenant baru + akun Admin (backend
							// belum punya modul User untuk mengundang role lain — lihat
							// docs/.backend-blockers.md).
							registerAccount.mutate({
								fullName: data.fullname,
								email: data.email,
								password: data.password,
								universityName: data.universityName,
							}),
						)}
					>
						<FieldGroup>
							{formError && (
								<p className="text-sm text-destructive">{formError}</p>
							)}
							<Field data-invalid={!!errors.fullname}>
								<FieldLabel htmlFor="fullname">Nama Lengkap</FieldLabel>
								<Input
									id="fullname"
									type="text"
									placeholder="John Doe"
									aria-invalid={!!errors.fullname}
									disabled={registerAccount.isPending}
									{...register('fullname')}
								/>
								{errors.fullname && (
									<FieldError>{errors.fullname.message}</FieldError>
								)}
							</Field>

							<Field data-invalid={!!errors.email}>
								<FieldLabel htmlFor="email">Email</FieldLabel>
								<Input
									id="email"
									type="email"
									placeholder="name@example.com"
									aria-invalid={!!errors.email}
									disabled={registerAccount.isPending}
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
									disabled={registerAccount.isPending}
									{...register('password')}
								/>
								{errors.password && (
									<FieldError>{errors.password.message}</FieldError>
								)}
							</Field>

							<Field data-invalid={!!errors.universityName}>
								<FieldLabel htmlFor="universityName">
									Nama Universitas
								</FieldLabel>
								<Input
									id="universityName"
									type="text"
									placeholder="Universitas Indonesia"
									aria-invalid={!!errors.universityName}
									disabled={registerAccount.isPending}
									{...register('universityName')}
								/>
								{errors.universityName && (
									<FieldError>{errors.universityName.message}</FieldError>
								)}
							</Field>
						</FieldGroup>
					</form>
				</CardContent>

				<CardFooter className="flex flex-col gap-4">
					<Button
						className="w-full"
						type="submit"
						disabled={registerAccount.isPending}
						form={formId}
					>
						{registerAccount.isPending ? 'Loading...' : 'Daftar'}
					</Button>
					<p className="text-center text-sm text-muted-foreground">
						Sudah punya akun?{' '}
						<Link to="/login" className="text-primary hover:underline">
							Masuk
						</Link>
					</p>
				</CardFooter>
			</Card>
		</div>
	);
}
