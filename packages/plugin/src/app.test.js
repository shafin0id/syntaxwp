/**
 * @jest-environment jsdom
 */
import { createRoot } from '@wordpress/element';
import { act } from 'react';
import App from './app';

jest.mock( '@wordpress/api-fetch', () => jest.fn( () => new Promise( () => {} ) ) );

global.IS_REACT_ACT_ENVIRONMENT = true;

function renderApp( bootstrap ) {
	const container = document.createElement( 'div' );
	act( () => {
		createRoot( container ).render( <App bootstrap={ bootstrap } /> );
	} );
	return container;
}

describe( 'App', () => {
	it( 'shows the connect form and marketing CTA when no site is connected', () => {
		const container = renderApp( {
			connected: false,
			siteId: '',
			apiBaseUrl: 'https://api.syntaxwp.com',
			marketingUrl: 'https://syntaxwp.com',
		} );

		expect( container.querySelector( '.syntaxwp-cta' ) ).not.toBeNull();
		expect( container.querySelector( 'input[type="password"]' ) ).not.toBeNull();
	} );

	it( 'shows the connected panel when a site is already connected', () => {
		const container = renderApp( {
			connected: true,
			siteId: 'site-12345678',
			apiBaseUrl: 'https://api.syntaxwp.com',
			marketingUrl: 'https://syntaxwp.com',
		} );

		expect( container.querySelector( '.syntaxwp-cta' ) ).toBeNull();
		expect( container.textContent ).toContain( 'Connected' );
	} );
} );
