import { createRoot } from '@wordpress/element';
import App from './app';
import './style.css';

const root = document.getElementById( 'syntaxwp-admin-root' );
if ( root ) {
	createRoot( root ).render( <App bootstrap={ window.syntaxwpAdmin } /> );
}
