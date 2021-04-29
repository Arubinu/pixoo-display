module.exports.rjust = ( string, width, padding ) => {
	padding = padding || ' ';
	padding = padding.substr( 0, 1 );
	if ( string.length < width )
		string = ( padding.repeat( width - string.length ) + string );

	return ( string );
};

module.exports.sleep = ms => new Promise( resolve => setTimeout( resolve, ms ) );

module.exports.resize = ( img, size ) => {
	let ratio = 0;
	if ( img.width > size )
		ratio = ( img.width / size );
	else if ( img.width == size )
		ratio = 1;

	if ( parseInt( img.width ) != img.width || parseInt( ratio ) != ratio || ratio < 1 )
		return ( null );

	let image = [];
	for ( let y of [ ...Array( size ).keys() ] )
	{
		for ( let x of [ ...Array( size ).keys() ] )
		{
			let count = 0;
			let avg = { r: 0, g: 0, b: 0, a: 0 };
			for ( let yi = 0; yi < ratio; ++yi )
			{
				for ( let xi = 0; xi < ratio; ++xi )
				{
					let pixel = img.data[ ( ( ( y * ratio ) + yi ) * img.width ) + ( ( x * ratio ) + xi ) ];
					avg.r += pixel.r;
					avg.g += pixel.g;
					avg.b += pixel.b;
					avg.a += ( ( typeof( pixel.a ) !== 'undefined' ) ? pixel.a : 255 );
					count += 1;
				}
			}

			avg.r = Math.round( avg.r / count );
			avg.g = Math.round( avg.g / count );
			avg.b = Math.round( avg.b / count );
			avg.a = Math.round( avg.a / count );
			image.push( avg );
		}
	}

	img.data = image;
	img.width = img.height = size;

	for ( let i = 0; i < img.data.length; ++i )
	{
		let pixel = img.data[ i ];
		pixel = module.exports.noalpha( pixel.r, pixel.g, pixel.b, pixel.a );
		img.data[ i ] = { r: pixel[ 0 ], g: pixel[ 1 ], b: pixel[ 2 ] };
	}

	return ( img );
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