import { apiFetch } from '~/core/lib/api-client';

/** Baris `chat_messages` sebagaimana dikembalikan `GET bab/:id/chat/history`. */
export type BackendChatMessage = {
	id: string;
	user_id: string;
	role: 'USER' | 'ASSISTANT';
	message: string;
};

export const chapterChatRemoteSource = {
	findHistory(babId: string): Promise<BackendChatMessage[]> {
		return apiFetch<BackendChatMessage[]>(`/bab/${babId}/chat/history`);
	},
};
