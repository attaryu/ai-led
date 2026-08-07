import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, Link } from 'react-router';
import {
	Card,
	CardContent,
	CardDescription,
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
import { sessionRepository } from '../../data/repositories/session.repository';
import { loginSchema, type LoginDto } from '../../domain/dtos/login.dto';

const formId = 'login-form';

export function Login() {
	const navigate = useNavigate();
	const {
		register,
		handleSubmit,
		formState: { errors, isSubmitting },
	} = useForm<LoginDto>({
		resolver: zodResolver(loginSchema),
		defaultValues: {
			email: '',
			password: '',
		},
	});

	const onSubmit = (data: LoginDto) => {
		console.log('Login Success:', data);
		// Menandai sesi aktif sebelum pindah halaman: tanpa ini landing page tetap
		// menganggap pengguna sebagai tamu dan menawarinya "Masuk" lagi.
		sessionRepository.signIn();
		navigate('/dashboard');
	};

	return (
		<div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
			<Card className="w-full max-w-md">
				<CardHeader>
					<CardTitle>Login</CardTitle>
					<CardDescription>
						Masuk ke akun Anda menggunakan email dan password
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form id={formId} onSubmit={handleSubmit(onSubmit)}>
						<FieldGroup>
							<Field data-invalid={!!errors.email}>
								<FieldLabel htmlFor="email">Email</FieldLabel>
								<Input
									id="email"
									type="email"
									placeholder="name@example.com"
									aria-invalid={!!errors.email}
									disabled={isSubmitting}
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
									disabled={isSubmitting}
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
						disabled={isSubmitting}
						form={formId}
					>
						{isSubmitting ? 'Loading...' : 'Masuk'}
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
