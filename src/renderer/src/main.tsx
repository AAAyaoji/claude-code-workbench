import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/tokens.css'
import './styles/global.css'

// 注意:不使用 <React.StrictMode>。StrictMode 在开发模式下会把组件的 effect
// 额外执行一次(setup → cleanup → setup),而 ChatView 的 effect 会启动 Claude CLI
// 子进程并向数据库插入会话记录。双调用会导致一次“启动会话”产生两条重复记录。
ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(<App />)
