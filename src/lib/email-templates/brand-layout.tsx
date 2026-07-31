import * as React from 'react'

import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'

import logoAsset from '@/assets/talking-email-logo.png.asset.json'

export const SITE_URL = 'https://talking-translator.com'
export const LOGO_URL = `${SITE_URL}${logoAsset.url}`

export const NAVY = '#0A0A29'
export const BLUE = '#3F44D2'
export const GREY = '#DBDBDF'

export const main = {
  backgroundColor: '#ffffff',
  fontFamily: 'Roboto, Arial, sans-serif',
  margin: 0,
  padding: '24px 0',
}
export const container = { maxWidth: '560px', margin: '0 auto', padding: '0 16px' }
export const header = {
  backgroundColor: BLUE,
  borderRadius: '12px 12px 0 0',
  padding: '24px 24px 18px',
  textAlign: 'center' as const,
}
export const logoImg = { display: 'block' }
export const brand = {
  color: '#ffffff',
  fontSize: '24px',
  fontWeight: 'bold' as const,
  margin: 0,
  letterSpacing: '0.5px',
}
export const card = {
  border: `1px solid ${GREY}`,
  borderTop: 'none',
  borderRadius: '0 0 12px 12px',
  padding: '28px 24px',
}
export const h1 = {
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: NAVY,
  margin: '0 0 20px',
}
export const text = {
  fontSize: '15px',
  color: NAVY,
  lineHeight: '1.6',
  margin: '0 0 16px',
}
export const link = { color: BLUE, textDecoration: 'underline' }
export const button = {
  backgroundColor: BLUE,
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: 'bold' as const,
  borderRadius: '8px',
  padding: '14px 28px',
  textDecoration: 'none',
}
export const buttonWrap = { textAlign: 'center' as const, margin: '32px 0' }
export const warn = {
  fontSize: '14px',
  color: NAVY,
  backgroundColor: GREY,
  borderRadius: '8px',
  padding: '12px 14px',
  lineHeight: '1.5',
  margin: '0 0 8px',
}
export const hr = { borderColor: GREY, margin: '24px 0' }
export const small = {
  fontSize: '12px',
  color: '#55575d',
  lineHeight: '1.5',
  wordBreak: 'break-all' as const,
}
export const footer = { fontSize: '12px', color: '#999999', margin: '20px 0 0' }
export const legal = {
  fontSize: '11px',
  color: '#999999',
  textAlign: 'center' as const,
  margin: '16px 0 0',
}

interface BrandEmailProps {
  preview: string
  title: string
  children: React.ReactNode
}

export const BrandEmail = ({ preview, title, children }: BrandEmailProps) => (
  <Html lang="fr" dir="ltr">
    <Head />
    <Preview>{preview}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <table role="presentation" cellPadding={0} cellSpacing={0} border={0} align="center" style={{ margin: '0 auto' }}>
            <tbody>
              <tr>
                <td style={{ verticalAlign: 'middle', paddingRight: '14px' }}>
                  <Img src={LOGO_URL} width="72" height="72" alt="TalKing" style={logoImg} />
                </td>
                <td style={{ verticalAlign: 'middle' }}>
                  <Text style={brand}>TalKing®</Text>
                </td>
              </tr>
            </tbody>
          </table>
        </Section>
        <Section style={card}>
          <Heading style={h1}>{title}</Heading>
          {children}
        </Section>
        <Text style={legal}>
          TalKing® -{' '}
          <Link href={SITE_URL} style={{ color: '#999999' }}>
            talking-translator.com
          </Link>
        </Text>
      </Container>
    </Body>
  </Html>
)

export { Hr }
