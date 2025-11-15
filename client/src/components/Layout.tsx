import type { PropsWithChildren } from 'react';
import './layout.css';

export default function Layout({ children }: PropsWithChildren) {
	return (
		<div className="layout-root">
			<header className="layout-header">
				<div className="layout-toolbar">
					<h1 className="layout-title">Warehouse Simulator</h1>
				</div>
			</header>
			<main className="layout-container">{children}</main>
		</div>
	);
}


