import React from 'react';
import { SignUp } from '@clerk/react';
import { dark } from '@clerk/themes';

export default function SignUpPage() {
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

  return (
    <div className="min-h-[85vh] flex items-center justify-center bg-background px-4 py-12 relative overflow-hidden fade-in">
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-primary/5 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-primary/5 blur-[120px] rounded-full" />
      </div>

      <div className="w-full max-w-md relative z-10 flex flex-col items-center">
        <div className="mb-10 text-center">
          <h1 className="text-4xl soso-display text-foreground mb-4">Join SOSO</h1>
          <p className="text-muted-foreground uppercase tracking-widest text-sm font-medium">
            Staff access is assigned by SOSO
          </p>
        </div>

        <SignUp 
          appearance={{
            theme: dark,
            variables: {
              colorPrimary: 'hsl(43, 59%, 45%)',
              colorBackground: 'hsl(36, 18%, 5%)',
              colorForeground: 'hsl(38, 41%, 94%)',
              colorMutedForeground: 'hsl(41, 41%, 88%)',
              colorInput: 'transparent',
              colorInputForeground: 'hsl(38, 41%, 94%)',
              borderRadius: '0px',
              fontFamily: 'Plus Jakarta Sans, sans-serif'
            },
            elements: {
              rootBox: "w-full",
              card: "border border-border/60 shadow-2xl bg-background/90 backdrop-blur-md w-full p-4 sm:p-6 rounded-none",
              headerTitle: "hidden",
              headerSubtitle: "hidden",
              socialButtonsBlockButton: "border-border hover:bg-secondary/5 rounded-none h-12 transition-colors",
              socialButtonsBlockButtonText: "font-medium tracking-wider text-sm",
              dividerLine: "bg-border",
              dividerText: "text-muted-foreground font-medium uppercase tracking-widest text-xs",
              formFieldInput: "border-border rounded-none h-12 focus:ring-1 focus:ring-primary focus:border-primary bg-background/50",
              formFieldLabel: "text-foreground uppercase tracking-wider text-xs font-medium",
              formButtonPrimary: "h-12 soso-btn-gold rounded-none text-primary-foreground font-medium uppercase tracking-widest text-sm w-full transition-colors mt-2",
              footerActionLink: "text-primary hover:text-primary/80 transition-colors font-medium",
              footerActionText: "text-muted-foreground",
              identityPreviewText: "text-foreground",
              identityPreviewEditButton: "text-primary hover:text-primary/80"
            }
          }}
          routing="path"
          path={`${basePath}/sign-up`}
          signInUrl={`${basePath}/sign-in`}
        />
      </div>
    </div>
  );
}
