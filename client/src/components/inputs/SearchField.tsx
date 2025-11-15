import TextField from '@mui/material/TextField';

type SearchFieldProps = {
	value: string;
	onChange: (value: string) => void;
	label?: string;
	placeholder?: string;
	disabled?: boolean;
	fullWidth?: boolean;
	className?: string;
};

export default function SearchField({
	value,
	onChange,
	label = 'Search',
	placeholder = 'Type to search…',
	disabled,
	fullWidth = true,
	className
}: SearchFieldProps) {
	return (
		<TextField
			className={className}
			variant="outlined"
			size="small"
			label={label}
			placeholder={placeholder}
			value={value}
			onChange={(e) => onChange(e.target.value)}
			disabled={disabled}
			fullWidth={fullWidth}
		/>
	);
}


