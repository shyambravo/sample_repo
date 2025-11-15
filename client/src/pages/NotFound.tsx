import { Stack, Typography } from '@mui/material';

export default function NotFound() {
	return (
		<Stack spacing={1}>
			<Typography variant="h4">404</Typography>
			<Typography color="text.secondary">Page not found.</Typography>
		</Stack>
	);
}


