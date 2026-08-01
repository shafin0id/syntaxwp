// Placeholder marketing copy — swap for real copy/URL later, no code
// change needed beyond SYNTAXWP_MARKETING_URL in syntaxwp.php.
export default function MarketingCTA( { marketingUrl } ) {
	return (
		<div className="syntaxwp-card syntaxwp-cta">
			<h2>Your site isn't protected yet</h2>
			<p>
				Connect SyntaxWP to get 24/7 health monitoring, automatic fixes, and instant
				rollback protection.
			</p>
			<a href={ marketingUrl } target="_blank" rel="noreferrer" className="syntaxwp-button">
				Get Started →
			</a>
		</div>
	);
}
