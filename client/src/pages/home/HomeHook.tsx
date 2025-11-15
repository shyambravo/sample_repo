import { useCallback, useEffect, useMemo, useState } from 'react';

export type RandomUser = {
	id: string;
	name: string;
	email: string;
	avatar: string;
};

async function fetchRandomUsers(count: number): Promise<RandomUser[]> {
	const response = await fetch(`https://randomuser.me/api/?results=${count}`);
	if (!response.ok) {
		throw new Error(`Failed to fetch users: ${response.status}`);
	}
	const json = await response.json();
	type RandomUserApi = {
		login?: { uuid?: string };
		name?: { first?: string; last?: string };
		email?: string;
		picture?: { thumbnail?: string; medium?: string };
	};
	return (json.results ?? []).map((u: RandomUserApi) => ({
		id: u.login?.uuid as string,
		name: `${u.name?.first ?? ''} ${u.name?.last ?? ''}`.trim(),
		email: u.email as string,
		avatar: (u.picture?.thumbnail ?? u.picture?.medium) as string
	}));
}

export function useHome() {
	const [query, setQuery] = useState('');
	const [users, setUsers] = useState<RandomUser[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const refresh = useCallback(async () => {
		setIsLoading(true);
		setError(null);
		try {
			const data = await fetchRandomUsers(8);
			setUsers(data);
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Unknown error';
			setError(message);
		} finally {
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	const filteredUsers = useMemo(() => {
		if (!query) return users;
		const q = query.toLowerCase();
		return users.filter(
			(u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
		);
	}, [users, query]);

	return {
		// state
		query,
		users,
		filteredUsers,
		isLoading,
		error,
		// actions
		setQuery,
		refresh
	};
}


