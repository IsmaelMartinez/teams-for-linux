/**
 * Documentation window renderer script
 */

document.addEventListener("DOMContentLoaded", () => {
	console.log("Documentation window loaded");
	
	// Add any interactive documentation functionality here
	const links = document.querySelectorAll("a[href^='http']");
	links.forEach(link => {
		link.addEventListener("click", (e) => {
			e.preventDefault();
			// External links would be handled here
			console.log("External link clicked:", link.href);
		});
	});
});
