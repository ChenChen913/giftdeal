import Link from "next/link";

export const metadata = {
  title: "隐私政策 · 礼尚人情账本",
};

export default function PrivacyPage() {
  return (
    <div className="invite-page">
      <div className="invite-card legal-card">
        <div className="eyebrow">隐私说明</div>
        <h1 className="title-lg" style={{ marginTop: 6 }}>
          隐私政策
        </h1>
        <p className="legal-meta">更新日期：2026 年 11 月 14 日</p>

        <div className="legal-body">
          <section>
            <h2>一、我们收集哪些信息</h2>
            <ul>
              <li>
                <strong>账号信息</strong>：手机号、登录验证码。用于身份识别与登录。
              </li>
              <li>
                <strong>账簿内容</strong>：账本名称、亲友姓名、关系标签、亲友手机号（选填）、
                备注，以及每笔礼金的金额、方向（送出/收到）、场景、日期与事由。
              </li>
              <li>
                <strong>协作关系</strong>：你加入了哪些账本、以什么角色加入。
              </li>
            </ul>
            <p>我们不收集你的通讯录、位置、设备标识，也不接入第三方广告或统计 SDK。</p>
          </section>

          <section>
            <h2>二、这些信息用来做什么</h2>
            <ul>
              <li>完成登录与身份校验；</li>
              <li>计算净差额、待回礼清单与场景统计；</li>
              <li>在同一账本的成员之间同步数据；</li>
              <li>在你主动操作时导出账本数据。</li>
            </ul>
            <p>我们不会将你的账簿数据用于广告投放、画像分析或出售给任何第三方。</p>
          </section>

          <section>
            <h2>三、谁能看到你的数据</h2>
            <ul>
              <li>
                <strong>你自己</strong>：登录后可查看全部内容。
              </li>
              <li>
                <strong>同一账本的成员</strong>：加入账本后，所有成员都能查看并修改该账本内的
                亲友与礼金记录。这是家庭共管账簿的设计前提，邀请前请确认。
              </li>
              <li>
                <strong>其他人</strong>：无法访问。所有账本内接口都会校验登录会话与账本成员身份，
                跨账本读取会返回「不存在」。
              </li>
            </ul>
            <p>
              界面默认开启「隐私模式」，把金额与完整姓名遮罩为星号，仅保留姓氏，
              用于防止旁人窥屏。需要说明的是：
              <strong>这是展示层的遮罩，服务端仍保存完整数据</strong>，
              解锁后即可看到真实值。
            </p>
          </section>

          <section>
            <h2>四、存储与安全</h2>
            <ul>
              <li>数据存储于 PostgreSQL 数据库，传输过程使用 HTTPS 加密。</li>
              <li>登录凭据与验证码均以哈希形式保存，不以明文存储。</li>
              <li>隐私模式的解锁状态由服务端签名的 httpOnly Cookie 判定，前端无法伪造。</li>
              <li>删除操作采用软删除：记录会从列表与统计中移除，但底层保留一段时间以支持误删恢复。</li>
            </ul>
          </section>

          <section>
            <h2>五、保存期限与删除</h2>
            <p>
              数据在你主动删除或注销账号前持续保存。你可以逐条删除礼金记录、删除亲友档案，
              或退出某个账本。退出后你将无法再访问该账本内容。
            </p>
          </section>

          <section>
            <h2>六、第三方服务</h2>
            <p>
              为完成登录，我们会调用短信服务商发送验证码，仅向其提供手机号与验证码内容。
              托管与数据库服务由云服务商提供，数据存储于其机房。除此之外不向任何第三方共享数据。
            </p>
          </section>

          <section>
            <h2>七、你的权利</h2>
            <ul>
              <li>查看并修改你录入的全部内容；</li>
              <li>导出账本的完整数据；</li>
              <li>删除单条记录、亲友档案，或退出账本；</li>
              <li>注销账号并要求清除数据。</li>
            </ul>
          </section>

          <section>
            <h2>八、联系我们</h2>
            <p>
              对隐私处理有任何疑问，可通过项目仓库的 Issues 反馈：
              <a
                href="https://github.com/ChenChen913/giftdeal/issues"
                target="_blank"
                rel="noreferrer"
                style={{ color: "var(--primary)" }}
              >
                github.com/ChenChen913/giftdeal
              </a>
              。
            </p>
          </section>
        </div>

        <Link href="/login" className="btn btn-ghost btn-block legal-back">
          返回登录
        </Link>
      </div>
    </div>
  );
}
