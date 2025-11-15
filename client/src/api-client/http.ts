const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
	const response = await fetch(`${API_BASE_URL}${path}`, {
		headers: {
			'Content-Type': 'application/json',
			...(init?.headers ?? {})
		},
		...init
	});
	if (!response.ok) {
		const text = await response.text().catch(() => '');
		throw new Error(text || `Request failed with status ${response.status}`);
	}
	return (await response.json()) as T;
}

export function get<T>(path: string): Promise<T> {
	return request<T>(path, { method: 'GET' });
}

export function post<T, B = unknown>(path: string, body?: B): Promise<T> {
	return request<T>(path, {
		method: 'POST',
		body: body != null ? JSON.stringify(body) : undefined
	});
}


