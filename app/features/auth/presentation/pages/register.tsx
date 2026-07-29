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
import {
	registerSchema,
	type RegisterDto,
} from '../../domain/dtos/register.dto';

const formId = 'register-form';

export function Register() {
	const navigate = useNavigate();
	const {
		register,
		handleSubmit,
		formState: { errors, isSubmitting },
	} = useForm<RegisterDto>({
		resolver: zodResolver(registerSchema),
		defaultValues: {
			fullname: '',
			email: '',
			password: '',
			universityName: '',
		},
	});

	const onSubmit = (data: RegisterDto) => {
		console.log('Register Success:', data);
		navigate('/dashboard');
	};

	return (
		<div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
			<Card className="w-full max-w-md">
				<CardHeader>
					<CardTitle>Registrasi</CardTitle>
					<CardDescription>
						Buat akun baru dan organisasi baru Anda
					</CardDescription>
				</CardHeader>

				<CardContent>
					<form id={formId} onSubmit={handleSubmit(onSubmit)}>
						<FieldGroup>
							<Field data-invalid={!!errors.fullname}>
								<FieldLabel htmlFor="fullname">Nama Lengkap</FieldLabel>
								<Input
									id="fullname"
									type="text"
									placeholder="John Doe"
									aria-invalid={!!errors.fullname}
									disabled={isSubmitting}
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

							<Field data-invalid={!!errors.universityName}>
								<FieldLabel htmlFor="universityName">
									Nama Universitas
								</FieldLabel>
								<Input
									id="universityName"
									type="text"
									placeholder="Universitas Indonesia"
									aria-invalid={!!errors.universityName}
									disabled={isSubmitting}
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
						disabled={isSubmitting}
						form={formId}
					>
						{isSubmitting ? 'Loading...' : 'Daftar'}
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
