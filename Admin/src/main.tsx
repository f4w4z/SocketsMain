import React from 'react';
import ReactDOM from 'react-dom/client';
import AdminDashboard from './AdminDashboard';
import SocketView from './SocketView';
import './index.css';

const params = new URLSearchParams(window.location.search);
const socketRoom = params.get('socket');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {socketRoom ? <SocketView roomId={socketRoom} onClose={function (): void {
      throw new Error('Function not implemented.');
    } } /> : <AdminDashboard />}
  </React.StrictMode>,
);
