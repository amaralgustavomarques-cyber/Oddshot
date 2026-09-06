import "./globals.css";

export const metadata = {
  title: "SureLine — odds & arbitragem",
  description: "Comparação de odds e detecção de arbitragem esportiva",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
