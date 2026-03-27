export default {
  siteTitle: 'Alpenglow Gear',
  siteDescription: 'Premium outdoor gear built to last. Packs, shelter, lighting, and more for hikers, climbers, and trail runners.',
  year: '2026',
  siteUrl: 'https://www.alpenglowgear.example',
  companyName: 'Alpenglow Gear',

  navItems: [
    { url: '/', label: 'Home' },
    { url: '/products/', label: 'Products' },
    { url: '/about/', label: 'About' },
    { url: '/blog/', label: 'Blog' },
    { url: '/contact/', label: 'Contact' },
  ],

  products: [
    {
      name: 'Trail Runner Pack 32L',
      price: '189',
      priceDisplay: '$189',
      category: 'packs',
      url: '/products/trail-runner-pack/',
      description: '32 liters of waterproof, hydration-compatible carrying capacity at just 680 grams.',
      features: '32L capacity &middot; 680g ultralight &middot; Waterproof &middot; Hydration-compatible',
    },
    {
      name: 'Summit Shelter 3P Tent',
      price: '449',
      priceDisplay: '$449',
      category: 'shelter',
      url: '/products/summit-shelter/',
      description: 'Freestanding 4-season shelter for 3. Sets up in under 4 minutes.',
      features: '3-person &middot; Freestanding &middot; 4-season rated &middot; 3.2kg packed',
    },
    {
      name: 'Beacon Pro Headlamp 700L',
      price: '89',
      priceDisplay: '$89',
      category: 'lighting',
      url: '/products/beacon-headlamp/',
      description: '700 lumens of USB-C rechargeable light with 45-hour runtime and red night mode.',
      features: '700 lumens &middot; USB-C rechargeable &middot; Red night mode &middot; 45hr runtime',
    },
  ],

  testimonials: [
    {
      quote: 'Carried my Trail Runner through 200 miles of the PCT. Not a single seam failure.',
      author: 'Morgan R., Thru-Hiker',
    },
    {
      quote: 'The Summit Shelter handled a surprise snowstorm at 12,000 feet. I slept warm and dry.',
      author: 'Alex T., Mountaineer',
    },
    {
      quote: 'Best headlamp I\'ve owned. The red mode saved my night vision on a 3am summit push.',
      author: 'Sam K., Alpine Climber',
    },
  ],
};
