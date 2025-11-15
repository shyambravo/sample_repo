import { Routes, Route } from 'react-router-dom';
import Home from '../pages/home/Home';
import NotFound from '../pages/NotFound';

export default function AppRoutes() {
	return (
		<Routes>
			<Route path="/" element={<Home />} />
			<Route path="*" element={<NotFound />} />
		</Routes>
	);
}


