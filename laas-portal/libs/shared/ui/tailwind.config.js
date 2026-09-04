export default {
  theme: {
    extend: {
      colors: {
        primary: 'hsl(var(--primary))',
        'primary-foreground': 'hsl(var(--primary-foreground))',

        secondary: 'hsl(var(--secondary))',
        'secondary-foreground': 'hsl(var(--secondary-foreground))',

        destructive: 'hsl(var(--destructive))',
        'destructive-foreground': 'hsl(var(--destructive-foreground))',

        accent: 'hsl(var(--accent))',
        'accent-foreground': 'hsl(var(--accent-foreground))',

        card: 'hsl(var(--card))',
        'card-foreground': 'hsl(var(--card-foreground))',

        muted: 'hsl(var(--muted))',
        'muted-foreground': 'hsl(var(--muted-foreground))',

        border: 'hsl(var(--border))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
      },
      boxShadow: {
        sm: '0 1px 2px 0 rgba(15, 23, 42, 0.01), 0 0 0 1px rgba(15, 23, 42, 0.015)',
        DEFAULT: '0 4px 6px -1px rgba(15, 23, 42, 0.02), 0 2px 4px -2px rgba(15, 23, 42, 0.01), 0 0 0 1px rgba(15, 23, 42, 0.02)',
        md: '0 4px 6px -1px rgba(15, 23, 42, 0.02), 0 10px 15px -3px rgba(15, 23, 42, 0.03), 0 20px 25px -5px rgba(15, 23, 42, 0.01), 0 0 0 1px rgba(15, 23, 42, 0.025)',
        lg: '0 10px 20px -5px rgba(15, 23, 42, 0.03), 0 20px 30px -10px rgba(15, 23, 42, 0.05), 0 30px 40px -15px rgba(15, 23, 42, 0.02), 0 0 0 1px rgba(15, 23, 42, 0.04)',
        xl: '0 20px 25px -5px rgba(15, 23, 42, 0.05), 0 8px 10px -6px rgba(15, 23, 42, 0.03), 0 0 0 1px rgba(15, 23, 42, 0.05)',
      },
      transitionTimingFunction: {
        'premium-out': 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
    },
  },
};
