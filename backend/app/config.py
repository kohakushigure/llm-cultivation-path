"""应用配置(pydantic-settings)。

从环境变量 / .env 读取。优先读项目根目录的 .env,再读 cwd 的 .env(覆盖)。
M0-3 定义所有配置项,M1 课程生成器与 M2 沙箱会用到。
"""
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/app/config.py → backend/app → backend → 项目根
_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(_PROJECT_ROOT / ".env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # === 后端服务 ===
    backend_host: str = "0.0.0.0"
    backend_port: int = 4200
    cors_origins: str = "http://localhost:3200"

    # === 代码执行沙箱 (M2) ===
    sandbox_image: str = "llmquest-sandbox:latest"
    sandbox_ml_image: str = "llmquest-sandbox-ml:latest"
    sandbox_max_concurrency: int = 5
    sandbox_default_timeout: int = 10
    sandbox_enabled: bool = True

    # === 公网防护(云端启用; 空/0 = 关闭, 公开库与本地默认休眠) ===
    # 访问口令(邀请码), 逗号分隔多个; 空 = 关闭门槛
    access_codes: str = ""
    # 邀请码真源文件(服务器独立私有文件, 600; 缺失/损坏时回退 access_codes)
    invite_codes_path: str = "/etc/llmquest/invite-codes.json"
    # 每 IP 每分钟沙箱运行次数上限; 0 = 不限
    sandbox_rate_limit: int = 10
    # 并发槽位满时排队等待上限(秒), 超时返回 503 沙箱繁忙而不是无限挂起
    sandbox_queue_timeout: int = 20

    # === 课程数据 ===
    data_dir: str = "app/data"

    # === 课程生成器 (M1) / 默认 DeepSeek 配置 ===
    # 学习者联网沙箱必须提交自己的 Key；runner 不会读取这里的 Key 作为兜底。
    # 模型名对照(见 https://api-docs.deepseek.com/quick_start/pricing):
    #   deepseek-v4-pro   最新对话模型(默认)
    #   deepseek-v4-flash 更快更便宜
    #   deepseek-chat / deepseek-reasoner  旧名, 2026-07-24 弃用
    openai_api_key: str = ""
    openai_base_url: str = "https://api.deepseek.com"
    generator_model: str = "deepseek-v4-pro"

    # === 共享 LLM 代理(云端内嵌 Key + 按 IP token 限流) ===
    # 开启后联网课程不强制学习者自带 Key: 后端用共享 Key 经代理转发,
    # 学习者代码只拿到临时令牌(绑定 IP/有效期/单次运行额度), 见 services/llm_proxy.py。
    # 默认关闭; 服务器 .env 设 LLM_PROXY_ENABLED=true + LLM_SHARED_API_KEY 激活。
    llm_proxy_enabled: bool = False
    # 共享 Key(服务器 .env 唯一真源, 不给公开仓/投放包)
    llm_shared_api_key: str = ""
    # 共享模式强制模型
    llm_shared_model: str = "deepseek-v4-flash"
    # 沙箱容器内可达的代理地址(host-gateway 映射宿主机)
    llm_proxy_container_url: str = "http://host.docker.internal:4200/api/llm/v1"
    # 上游真实端点(转发目标)
    llm_upstream_base_url: str = "https://api.deepseek.com"
    # 滑动窗口(秒) + 每 IP 每窗口 token 上限(输入+输出)
    llm_token_window_seconds: int = 3600
    llm_token_budget_per_ip: int = 200_000
    # 单次沙箱运行 token 上限(临时令牌额度)
    llm_token_budget_per_run: int = 50_000
    # 全局每小时 token 上限
    llm_token_budget_global: int = 20_000_000
    # 每小时最多独立 IP 数
    llm_max_distinct_ips_per_hour: int = 100
    # 临时令牌有效期(秒)
    llm_token_ttl_seconds: int = 1800

    @property
    def cors_origins_list(self) -> list[str]:
        """CORS 来源按逗号拆分。"""
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def access_codes_list(self) -> list[str]:
        """访问口令按逗号拆分; 空列表 = 不启用门槛。"""
        return [c.strip() for c in self.access_codes.split(",") if c.strip()]

    @property
    def project_root(self) -> Path:
        return _PROJECT_ROOT

    @property
    def backend_root(self) -> Path:
        """backend/ 目录绝对路径。"""
        return _PROJECT_ROOT / "backend"

    @property
    def data_path(self) -> Path:
        """课程数据目录(backend/app/data)。"""
        return self.backend_root / self.data_dir


settings = Settings()
