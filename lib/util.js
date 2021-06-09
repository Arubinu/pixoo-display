const FS = require( 'fs' );
const Deasync = require( 'deasync' );
const TempFile = require( 'tempfile' );
const ImageMagick = require( 'imagemagick' );

module.exports.rjust = ( string, width, padding ) => {
	padding = padding || ' ';
	padding = padding.substr( 0, 1 );
	if ( string.length < width )
		string = ( padding.repeat( width - string.length ) + string );

	return ( string );
};

module.exports.sleep = ms => new Promise( resolve => setTimeout( resolve, ms ) );

module.exports.resize = ( image, width ) => {
	let result = false;
	let dest = TempFile( '.gif' );
	ImageMagick.convert( [
			'-background', 'black',
			'-alpha', 'remove',
			'-alpha', 'off',
			'-resize', width.toString(),
			image,
			dest
		],
		( err, stdout ) => {
			if ( err )
				return ( result = [ err, '', null ] );

			result = [ false, FS.readFileSync( dest ) ];
		} );

	Deasync.loopWhile( () => !result );
	FS.unlinkSync( dest );

	if ( result[ 0 ] )
		throw result[ 0 ];

	return ( result[ 1 ] );
};

module.exports.noalpha = ( r, g, b, a ) => {
	if ( typeof( a ) !== 'undefined' && a < 255 )
	{
		//let alpha = ( 1 - parseInt( a / 255 ) );
		let alpha = parseInt( a / 255 );
		r = Math.round( ( alpha * ( r / 255 ) ) * 255 );
		g = Math.round( ( alpha * ( g / 255 ) ) * 255 );
		b = Math.round( ( alpha * ( b / 255 ) ) * 255 );
	}

	return ( [ r, g, b ] );
};

module.exports.getpixel = ( img, size, position ) => {
	let multi = ( img.data.length / ( img.height * img.width ) );
	let pos = ( ( ( position[ 1 ] * size[ 1 ] ) + position[ 0 ] ) * multi );

	let pixel = [ img.data[ pos ], img.data[ pos + 1 ], img.data[ pos + 2 ] ];
	if ( multi == 4 )
		pixel.push( img.data[ pos + 3 ] )

	return ( pixel );
};

module.exports.hexlify = int => {
	if ( int > 255 || int < 0 )
		throw new Error( 'hexlify works only with number between 0 and 255' );

	return ( Math.round( int ).toString( 16 ).padStart( 2, '0' ) );
}

module.exports.unhexlify = str => {
	var result = '';
	if ( str.length % 2 !== 0 )
		throw new Error( 'The string length is not a multiple of 2' );

	for ( let i = 0, l = str.length; i < l; i += 2 )
	{
		const toHex = parseInt( str.substr( i, 2 ), 16 );
		if ( isNaN( toHex ) )
			throw new Error('str contains non hex character');

		result += String.fromCharCode( toHex );
	}

	return ( result );
};
