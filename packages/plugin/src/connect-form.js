import { useState } from '@wordpress/element';
import { saveSettings } from './api';

export default function ConnectForm( { defaultApiBaseUrl, onConnected } ) {
	const [ siteId, setSiteId ] = useState( '' );
	const [ siteSecret, setSiteSecret ] = useState( '' );
	const [ apiBaseUrl, setApiBaseUrl ] = useState( defaultApiBaseUrl || '' );
	const [ showAdvanced, setShowAdvanced ] = useState( false );
	const [ error, setError ] = useState( '' );
	const [ saving, setSaving ] = useState( false );

	function handleSubmit( event ) {
		event.preventDefault();
		setError( '' );
		setSaving( true );

		saveSettings( { siteId, siteSecret, apiBaseUrl } )
			.then( () => onConnected( { connected: true, site_id: siteId, api_base_url: apiBaseUrl } ) )
			.catch( ( err ) => setError( err.message || 'Could not save settings.' ) )
			.finally( () => setSaving( false ) );
	}

	return (
		<form className="syntaxwp-card" onSubmit={ handleSubmit }>
			<h2>Connect this site</h2>
			<p>
				Paste the Site ID and Site Secret shown once when you added this site on the
				SyntaxWP dashboard.
			</p>

			{ error && <p className="syntaxwp-error">{ error }</p> }

			<label className="syntaxwp-field">
				Site ID
				<input
					type="text"
					value={ siteId }
					onChange={ ( e ) => setSiteId( e.target.value ) }
					required
				/>
			</label>

			<label className="syntaxwp-field">
				Site Secret
				<input
					type="password"
					value={ siteSecret }
					onChange={ ( e ) => setSiteSecret( e.target.value ) }
					required
				/>
			</label>

			<button
				type="button"
				className="syntaxwp-link-button"
				onClick={ () => setShowAdvanced( ! showAdvanced ) }
			>
				{ showAdvanced ? 'Hide' : 'Show' } advanced options
			</button>

			{ showAdvanced && (
				<label className="syntaxwp-field">
					API Base URL
					<input
						type="url"
						value={ apiBaseUrl }
						onChange={ ( e ) => setApiBaseUrl( e.target.value ) }
						placeholder="https://api.syntaxwp.com"
					/>
				</label>
			) }

			<button type="submit" className="syntaxwp-button" disabled={ saving }>
				{ saving ? 'Connecting…' : 'Connect' }
			</button>
		</form>
	);
}
