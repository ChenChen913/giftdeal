import Link from "next/link";

export const metadata = {
  title: "服务协议 · 礼尚人情账本",
};

export default function TermsPage() {
  return (
    <div className="invite-page">
      <div className="invite-card legal-card">
        <div className="eyebrow">法律条款</div>
        <h1 className="title-lg" style={{ marginTop: 6 }}>
          服务协议
        </h1>
        <p className="legal-meta">更新日期：2026 年 11 月 14 日</p>

        <div className="legal-body">
          <section>
            <h2>一、服务说明</h2>
            <p>
              「礼尚 · 人情账本」（以下简称「本服务」）是一款帮助家庭记录与对账人情往来的工具。
              你可以记录与亲友之间的送出、收到礼金，查看净差额、待回礼清单，并与家庭成员共享同一本账簿。
            </p>
            <p>
              本服务仅提供记录与统计功能，不构成任何礼俗建议、财务建议或法律意见。
              具体随礼金额与方式由你自行决定。
            </p>
          </section>

          <section>
            <h2>二、账号与登录</h2>
            <ul>
              <li>本服务使用手机号加短信验证码登录，首次验证通过即自动创建账号。</li>
              <li>你应确保用于登录的手机号为你本人所有，并对该账号下的一切操作负责。</li>
              <li>请妥善保管设备与登录状态。在公共设备上使用后，应及时退出登录。</li>
            </ul>
          </section>

          <section>
            <h2>三、使用规范</h2>
            <p>你承诺不利用本服务从事下列行为：</p>
            <ul>
              <li>录入违法违规、侵犯他人合法权益的内容；</li>
              <li>未经他人同意，擅自录入他人的身份信息或财务信息；</li>
              <li>尝试绕过登录、越权访问他人账簿，或干扰服务正常运行；</li>
              <li>将本服务用于任何形式的商业转售。</li>
            </ul>
          </section>

          <section>
            <h2>四、数据归属与共享</h2>
            <ul>
              <li>你录入的账簿数据归你与同账本成员共同所有。</li>
              <li>
                <strong>加入同一账本后，所有成员均可查看并修改该账本内的全部亲友与礼金记录。</strong>
                邀请他人加入前，请确认你接受这一共享范围。
              </li>
              <li>你可以随时导出账本数据，或删除自己录入的记录。</li>
            </ul>
          </section>

          <section>
            <h2>五、服务变更、中断与终止</h2>
            <p>
              本服务可能因维护、升级或不可抗力暂停。我们会尽力提前告知，但不对因此造成的数据不可用承担责任。
              建议你定期导出重要数据。
            </p>
          </section>

          <section>
            <h2>六、免责声明</h2>
            <p>
              本服务按「现状」提供。我们会尽力保证数据准确与可用，但不对因录入错误、设备丢失、
              第三方服务故障等造成的损失承担责任。涉及重要人情往来时，建议同时保留线下记录。
            </p>
          </section>

          <section>
            <h2>七、协议更新</h2>
            <p>
              本协议可能随功能调整而更新，更新后会在本页公布。若你在更新后继续使用本服务，
              视为接受修订后的协议。
            </p>
          </section>

          <section>
            <h2>八、联系我们</h2>
            <p>
              对本协议有任何疑问，可通过项目仓库的 Issues 反馈：
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
