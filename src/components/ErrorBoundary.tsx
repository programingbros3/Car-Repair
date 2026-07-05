import { Component, ErrorInfo, ReactNode } from 'react'

/* ════════════════════════════════════════
   ErrorBoundary — يمنع «الشاشة البيضاء»
   ────────────────────────────────────────
   أي استثناء غير مُلتقَط أثناء التصيير (render) في React يفكّك شجرة الواجهة
   بالكامل ويترك شاشة بيضاء فارغة بلا أي رسالة. هذا المكوّن يلتقط الخطأ ويعرض
   شاشة خطأ عربية واضحة مع زر «إعادة التشغيل» بدل الفراغ الأبيض، فيبقى التطبيق
   قابلاً للاسترجاع (المستخدم لا يعلق). النسخة الاحتياطية التلقائية للبيانات لا
   تتأثر — القاعدة سليمة على القرص، المشكلة في التصيير فقط.
════════════════════════════════════════ */
type Props = { children: ReactNode }
type State = { error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // يُطبع في وحدة تحكّم المطوّر (dev) ويساعد في التشخيص لاحقاً
    console.error('واجهة التطبيق واجهت خطأ غير متوقع:', error, info.componentStack)
  }

  private handleReload = () => {
    window.location.reload()
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div style={overlay}>
        <div style={card}>
          <div style={{ fontSize: '2.6rem' }}>⚠️</div>
          <h1 style={title}>حدث خطأ غير متوقع</h1>
          <p style={subtitle}>
            تعذّر عرض هذه الشاشة. بياناتك محفوظة وسليمة — أعد تشغيل الواجهة للمتابعة.
            إذا تكرّر الخطأ تواصل مع المطوّر وأرفق الرسالة التالية.
          </p>
          <pre style={errorBox}>{error.message}</pre>
          <button style={button} onClick={this.handleReload}>إعادة تشغيل الواجهة</button>
        </div>
      </div>
    )
  }
}

/* ── Inline styles (ألوان المشروع، RTL) ── */
const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, direction: 'rtl',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: '#F5F5F5', zIndex: 3000, padding: '1rem',
}

const card: React.CSSProperties = {
  background: '#fff', borderRadius: 14, padding: '2.5rem 2.25rem',
  width: '100%', maxWidth: 480, boxShadow: '0 12px 40px rgba(0,0,0,0.18)',
  display: 'flex', flexDirection: 'column', gap: '0.85rem', alignItems: 'center',
  textAlign: 'center',
}

const title: React.CSSProperties = {
  fontSize: '1.5rem', fontWeight: 700, color: '#1E2A38', margin: 0,
}

const subtitle: React.CSSProperties = {
  fontSize: '0.95rem', color: '#555', margin: 0, lineHeight: 1.7,
}

const errorBox: React.CSSProperties = {
  width: '100%', maxHeight: 140, overflow: 'auto', margin: 0,
  background: '#fdf0ef', border: '1px solid #f3c9c4', borderRadius: 8,
  padding: '0.7rem 0.9rem', color: '#c0392b', fontSize: '0.8rem',
  direction: 'ltr', textAlign: 'left', whiteSpace: 'pre-wrap',
}

const button: React.CSSProperties = {
  fontFamily: 'inherit', fontSize: '1rem', fontWeight: 700,
  border: 'none', borderRadius: 8, padding: '0.7rem 1.6rem', marginTop: '0.35rem',
  background: '#2ECC71', color: '#fff', cursor: 'pointer',
}
