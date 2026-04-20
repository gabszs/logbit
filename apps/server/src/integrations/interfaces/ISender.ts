export interface ISender {
	send(msg: string): Promise<void>;
}
