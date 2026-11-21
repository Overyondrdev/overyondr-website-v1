// Navigation mirrors the live Squarespace site (audited 2026-11-19).
export const phoneFreeSpaces = [
  { label: 'Home', href: '/home-tray' },
  { label: 'Schools', href: '/phone-free-schools' },
  { label: 'Music', href: '/phone-free-music' },
  { label: 'Comedy', href: '/phone-free-comedy-shows' },
  { label: 'Events & Weddings', href: '/phone-free-events' },
  { label: 'Courts', href: '/phone-free-courthouses' },
  { label: 'Universities', href: '/phone-free-universities' },
  { label: 'Camps & Youth Programs', href: '/camps-youth-programs' },
  { label: 'Workplace', href: '/phone-free-workplace' },
  { label: 'Productions', href: '/phone-free-productions' },
  { label: 'Hospitality', href: '/phone-free-hospitality' },
  { label: 'Other', href: '/other' },
];

export const mainNav = [
  { label: 'About', href: '/about' },
  { label: 'How It Works', href: '/phone-locking-pouch' },
  { label: 'Phone-Free Spaces', href: '/phone-free-spaces', children: phoneFreeSpaces },
  { label: 'Yondr International', href: '/yondr-global' },
  { label: 'Press', href: '/press' },
  { label: 'Get in touch', href: '/contact' },
];

export const footerNav = [
  { label: 'FAQ', href: '/faq' },
  { label: 'About Us', href: '/about' },
  { label: 'How It Works', href: '/phone-locking-pouch' },
  { label: 'Phone-Free Spaces', href: '/phone-free-spaces' },
  { label: 'Contact Us', href: '/contact' },
  { label: 'Blog', href: '/blog' },
  { label: 'Press', href: '/press' },
  { label: 'Yondr Home Tray', href: '/home-tray' },
  { label: 'Terms and Conditions', href: '/termsandconditions' },
  { label: 'Privacy Policy', href: '/privacypolicy' },
  { label: 'Careers', href: 'https://jobs.ashbyhq.com/yondr' },
  { label: 'LinkedIn', href: 'https://www.linkedin.com/company/overyondr/' },
];
