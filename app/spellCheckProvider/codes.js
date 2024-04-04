const codes = [
	{
		'language': 'Afrikaans',
		'code': 'af'
	},
	{
		'language': 'Twi',
		'code': 'ak'
	},
	{
		'language': 'Amharic',
		'code': 'am'
	},
	{
		'language': 'Aragonese',
		'code': 'an'
	},
	{
		'language': 'Arabic',
		'code': 'ar'
	},
	{
		'language': 'RTL Pseudolocale',
		'code': 'ar-XB'
	},
	{
		'language': 'Assamese',
		'code': 'as'
	},
	{
		'language': 'Asturian',
		'code': 'ast'
	},
	{
		'language': 'Azerbaijani',
		'code': 'az'
	},
	{
		'language': 'Belarusian',
		'code': 'be'
	},
	{
		'language': 'Bulgarian',
		'code': 'bg'
	},
	{
		'language': 'Bengali',
		'code': 'bn'
	},
	{
		'language': 'Breton',
		'code': 'br'
	},
	{
		'language': 'Bosnian',
		'code': 'bs'
	},
	{
		'language': 'Catalan',
		'code': 'ca'
	},
	{
		'language': 'Cebuano',
		'code': 'ceb'
	},
	{
		'language': 'Cherokee',
		'code': 'chr'
	},
	{
		'language': 'Kurdish (Arabic), Sorani',
		'code': 'ckb'
	},
	{
		'language': 'Corsican',
		'code': 'co'
	},
	{
		'language': 'Czech',
		'code': 'cs'
	},
	{
		'language': 'Welsh',
		'code': 'cy'
	},
	{
		'language': 'Danish',
		'code': 'da'
	},
	{
		'language': 'German',
		'code': 'de'
	},
	{
		'language': 'German (Austria)',
		'code': 'de-AT'
	},
	{
		'language': 'German (Switzerland)',
		'code': 'de-CH'
	},
	{
		'language': 'German (Germany)',
		'code': 'de-DE'
	},
	{
		'language': 'German (Liechtenstein)',
		'code': 'de-LI'
	},
	{
		'language': 'Ewe',
		'code': 'ee'
	},
	{
		'language': 'Greek',
		'code': 'el'
	},
	{
		'language': 'English',
		'code': 'en'
	},
	{
		'language': 'English (Australia)',
		'code': 'en-AU'
	},
	{
		'language': 'English (Canada)',
		'code': 'en-CA'
	},
	{
		'language': 'English (UK)',
		'code': 'en-GB'
	},
	{
		'language': 'English (UK, OED spelling)',
		'code': 'en-GB-oxendict'
	},
	{
		'language': 'English (Ireland)',
		'code': 'en-IE'
	},
	{
		'language': 'English (India)',
		'code': 'en-IN'
	},
	{
		'language': 'English (New Zealand)',
		'code': 'en-NZ'
	},
	{
		'language': 'English (US)',
		'code': 'en-US'
	},
	{
		'language': 'Long strings Pseudolocale',
		'code': 'en-XA'
	},
	{
		'language': 'English (South Africa)',
		'code': 'en-ZA'
	},
	{
		'language': 'Esperanto',
		'code': 'eo'
	},
	{
		'language': 'Spanish',
		'code': 'es'
	},
	{
		'language': 'Spanish (Latin America)',
		'code': 'es-419'
	},
	{
		'language': 'Spanish (Argentina)',
		'code': 'es-AR'
	},
	{
		'language': 'Spanish (Chile)',
		'code': 'es-CL'
	},
	{
		'language': 'Spanish (Colombia)',
		'code': 'es-CO'
	},
	{
		'language': 'Spanish (Costa Rica)',
		'code': 'es-CR'
	},
	{
		'language': 'Spanish (Spain)',
		'code': 'es-ES'
	},
	{
		'language': 'Spanish (Honduras)',
		'code': 'es-HN'
	},
	{
		'language': 'Spanish (Mexico)',
		'code': 'es-MX'
	},
	{
		'language': 'Spanish (Peru)',
		'code': 'es-PE'
	},
	{
		'language': 'Spanish (US)',
		'code': 'es-US'
	},
	{
		'language': 'Spanish (Uruguay)',
		'code': 'es-UY'
	},
	{
		'language': 'Spanish (Venezuela)',
		'code': 'es-VE'
	},
	{
		'language': 'Estonian',
		'code': 'et'
	},
	{
		'language': 'Basque',
		'code': 'eu'
	},
	{
		'language': 'Persian',
		'code': 'fa'
	},
	{
		'language': 'Finnish',
		'code': 'fi'
	},
	{
		'language': 'Filipino',
		'code': 'fil'
	},
	{
		'language': 'Faroese',
		'code': 'fo'
	},
	{
		'language': 'French',
		'code': 'fr'
	},
	{
		'language': 'French (Canada)',
		'code': 'fr-CA'
	},
	{
		'language': 'French (Switzerland)',
		'code': 'fr-CH'
	},
	{
		'language': 'French (France)',
		'code': 'fr-FR'
	},
	{
		'language': 'Frisian',
		'code': 'fy'
	},
	{
		'language': 'Irish',
		'code': 'ga'
	},
	{
		'language': 'Scots Gaelic',
		'code': 'gd'
	},
	{
		'language': 'Galician',
		'code': 'gl'
	},
	{
		'language': 'Guarani',
		'code': 'gn'
	},
	{
		'language': 'Gujarati',
		'code': 'gu'
	},
	{
		'language': 'Hausa',
		'code': 'ha'
	},
	{
		'language': 'Hawaiian',
		'code': 'haw'
	},
	{
		'language': 'Hebrew',
		'code': 'he'
	},
	{
		'language': 'Hindi',
		'code': 'hi'
	},
	{
		'language': 'Hmong',
		'code': 'hmn'
	},
	{
		'language': 'Croatian',
		'code': 'hr'
	},
	{
		'language': 'Haitian Creole',
		'code': 'ht'
	},
	{
		'language': 'Hungarian',
		'code': 'hu'
	},
	{
		'language': 'Armenian',
		'code': 'hy'
	},
	{
		'language': 'Interlingua',
		'code': 'ia'
	},
	{
		'language': 'Indonesian',
		'code': 'id'
	},
	{
		'language': 'Igbo',
		'code': 'ig'
	},
	{
		'language': 'Icelandic',
		'code': 'is'
	},
	{
		'language': 'Italian',
		'code': 'it'
	},
	{
		'language': 'Italian (Switzerland)',
		'code': 'it-CH'
	},
	{
		'language': 'Italian (Italy)',
		'code': 'it-IT'
	},
	{
		'language': 'Japanese',
		'code': 'ja'
	},
	{
		'language': 'Javanese',
		'code': 'jv'
	},
	{
		'language': 'Georgian',
		'code': 'ka'
	},
	{
		'language': 'Kazakh',
		'code': 'kk'
	},
	{
		'language': 'Cambodian',
		'code': 'km'
	},
	{
		'language': 'Kannada',
		'code': 'kn'
	},
	{
		'language': 'Korean',
		'code': 'ko'
	},
	{
		'language': 'Konkani',
		'code': 'kok'
	},
	{
		'language': 'Krio',
		'code': 'kri'
	},
	{
		'language': 'Kurdish',
		'code': 'ku'
	},
	{
		'language': 'Kyrgyz',
		'code': 'ky'
	},
	{
		'language': 'Latin',
		'code': 'la'
	},
	{
		'language': 'Luxembourgish',
		'code': 'lb'
	},
	{
		'language': 'Luganda',
		'code': 'lg'
	},
	{
		'language': 'Lingala',
		'code': 'ln'
	},
	{
		'language': 'Laothian',
		'code': 'lo'
	},
	{
		'language': 'Lithuanian',
		'code': 'lt'
	},
	{
		'language': 'Latvian',
		'code': 'lv'
	},
	{
		'language': 'Malagasy',
		'code': 'mg'
	},
	{
		'language': 'Maori',
		'code': 'mi'
	},
	{
		'language': 'Macedonian',
		'code': 'mk'
	},
	{
		'language': 'Malayalam',
		'code': 'ml'
	},
	{
		'language': 'Mongolian',
		'code': 'mn'
	},
	{
		'language': 'Moldavian',
		'code': 'mo'
	},
	{
		'language': 'Marathi',
		'code': 'mr'
	},
	{
		'language': 'Malay',
		'code': 'ms'
	},
	{
		'language': 'Maltese',
		'code': 'mt'
	},
	{
		'language': 'Burmese',
		'code': 'my'
	},
	{
		'language': 'Norwegian (Bokmal)',
		'code': 'nb'
	},
	{
		'language': 'Nepali',
		'code': 'ne'
	},
	{
		'language': 'Dutch',
		'code': 'nl'
	},
	{
		'language': 'Norwegian (Nynorsk)',
		'code': 'nn'
	},
	{
		'language': 'Norwegian',
		'code': 'no'
	},
	{
		'language': 'Sepedi',
		'code': 'nso'
	},
	{
		'language': 'Nyanja',
		'code': 'ny'
	},
	{
		'language': 'Occitan',
		'code': 'oc'
	},
	{
		'language': 'Oromo',
		'code': 'om'
	},
	{
		'language': 'Odia (Oriya)',
		'code': 'or'
	},
	{
		'language': 'Punjabi',
		'code': 'pa'
	},
	{
		'language': 'Polish',
		'code': 'pl'
	},
	{
		'language': 'Pashto',
		'code': 'ps'
	},
	{
		'language': 'Portuguese',
		'code': 'pt'
	},
	{
		'language': 'Portuguese (Brazil)',
		'code': 'pt-BR'
	},
	{
		'language': 'Portuguese (Portugal)',
		'code': 'pt-PT'
	},
	{
		'language': 'Quechua',
		'code': 'qu'
	},
	{
		'language': 'Romansh',
		'code': 'rm'
	},
	{
		'language': 'Romanian',
		'code': 'ro'
	},
	{
		'language': 'Russian',
		'code': 'ru'
	},
	{
		'language': 'Kinyarwanda',
		'code': 'rw'
	},
	{
		'language': 'Sindhi',
		'code': 'sd'
	},
	{
		'language': 'Serbo-Croatian',
		'code': 'sh'
	},
	{
		'language': 'Sinhalese',
		'code': 'si'
	},
	{
		'language': 'Slovak',
		'code': 'sk'
	},
	{
		'language': 'Slovenian',
		'code': 'sl'
	},
	{
		'language': 'Samoan',
		'code': 'sm'
	},
	{
		'language': 'Shona',
		'code': 'sn'
	},
	{
		'language': 'Somali',
		'code': 'so'
	},
	{
		'language': 'Albanian',
		'code': 'sq'
	},
	{
		'language': 'Serbian',
		'code': 'sr'
	},
	{
		'language': 'Sesotho',
		'code': 'st'
	},
	{
		'language': 'Sundanese',
		'code': 'su'
	},
	{
		'language': 'Swedish',
		'code': 'sv'
	},
	{
		'language': 'Swahili',
		'code': 'sw'
	},
	{
		'language': 'Tamil',
		'code': 'ta'
	},
	{
		'language': 'Telugu',
		'code': 'te'
	},
	{
		'language': 'Tajik',
		'code': 'tg'
	},
	{
		'language': 'Thai',
		'code': 'th'
	},
	{
		'language': 'Tigrinya',
		'code': 'ti'
	},
	{
		'language': 'Turkmen',
		'code': 'tk'
	},
	{
		'language': 'Tswana',
		'code': 'tn'
	},
	{
		'language': 'Tonga',
		'code': 'to'
	},
	{
		'language': 'Turkish',
		'code': 'tr'
	},
	{
		'language': 'Tatar',
		'code': 'tt'
	},
	{
		'language': 'Twi',
		'code': 'tw'
	},
	{
		'language': 'Uyghur',
		'code': 'ug'
	},
	{
		'language': 'Ukrainian',
		'code': 'uk'
	},
	{
		'language': 'Urdu',
		'code': 'ur'
	},
	{
		'language': 'Uzbek',
		'code': 'uz'
	},
	{
		'language': 'Vietnamese',
		'code': 'vi'
	},
	{
		'language': 'Walloon',
		'code': 'wa'
	},
	{
		'language': 'Wolof',
		'code': 'wo'
	},
	{
		'language': 'Xhosa',
		'code': 'xh'
	},
	{
		'language': 'Yiddish',
		'code': 'yi'
	},
	{
		'language': 'Yoruba',
		'code': 'yo'
	},
	{
		'language': 'Chinese',
		'code': 'zh'
	},
	{
		'language': 'Chinese (China)',
		'code': 'zh-CN'
	},
	{
		'language': 'Chinese (Hong Kong)',
		'code': 'zh-HK'
	},
	{
		'language': 'Chinese (Taiwan)',
		'code': 'zh-TW'
	},
	{
		'language': 'Zulu',
		'code': 'zu'
	}
];

module.exports = codes;
