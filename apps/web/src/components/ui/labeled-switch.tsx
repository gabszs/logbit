import { useId } from "react";
import { Switch } from "./switch";

interface LabeledSwitchProps {
	label: string;
	checked: boolean;
	onCheckedChange: (checked: boolean) => void;
	className?: string;
}

export function LabeledSwitch({
	label,
	checked,
	onCheckedChange,
	className,
}: LabeledSwitchProps) {
	const id = useId();

	return (
		<label htmlFor={id} className="flex w-fit items-center gap-3 pt-1">
			<span className="text-muted-foreground text-sm">{label}</span>
			<Switch
				id={id}
				checked={checked}
				onCheckedChange={onCheckedChange}
				aria-label={label}
				className={className}
			/>
		</label>
	);
}
