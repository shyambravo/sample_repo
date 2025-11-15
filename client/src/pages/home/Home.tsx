import { useHome } from './HomeHook';
import './home.css';
import SearchField from '../../components/inputs/SearchField';

export default function Home() {
	const { query, setQuery, filteredUsers, isLoading, error, refresh } = useHome();

	return (
		<div className="home-root">
			<div className="home-controls">
				<h1 className="home-title">Home</h1>
				<SearchField value={query} onChange={setQuery} placeholder="Search users by name or email" />
				<button className="home-button" onClick={refresh} disabled={isLoading}>
					Refresh
				</button>
			</div>

			{isLoading && !filteredUsers.length ? (
				<div className="home-center">
					<span className="home-loading">Loading…</span>
				</div>
			) : error ? (
				<p className="home-error">Error: {error}</p>
			) : (
				<div className="home-grid">
					{filteredUsers.map((u) => (
						<div key={u.id} className="home-item">
							<div className="home-card">
								<img className="home-avatar" src={u.avatar} alt={u.name} />
								<div>
									<div className="home-name">{u.name}</div>
									<div className="home-email">{u.email}</div>
								</div>
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
}


