"""
Neo4j 5.x 兼容性补丁

修复 Mem0 生成的关系类型包含多个冒号的问题。
Neo4j 5.x 不允许关系类型中包含冒号，需要替换为下划线。
"""

import logging
from typing import Any, Dict, List

logger = logging.getLogger(__name__)


def sanitize_relationship_type(relationship_type: str) -> str:
    """
    清理关系类型，将不符合 Neo4j 5.x 规范的字符替换掉。

    Neo4j 5.x 规则：
    - 关系类型不能包含冒号 ':'
    - 推荐使用下划线 '_' 或驼峰命名

    Args:
        relationship_type: 原始关系类型字符串

    Returns:
        清理后的关系类型字符串
    """
    if not relationship_type:
        return relationship_type

    # 替换冒号为下划线
    sanitized = relationship_type.replace(':', '_')

    # 替换其他可能有问题的字符
    sanitized = sanitized.replace('/', '_')
    sanitized = sanitized.replace('\\', '_')
    sanitized = sanitized.replace(' ', '_')
    sanitized = sanitized.replace('-', '_')

    # 移除连续的下划线
    while '__' in sanitized:
        sanitized = sanitized.replace('__', '_')

    # 移除首尾的下划线
    sanitized = sanitized.strip('_')

    if sanitized != relationship_type:
        logger.debug(f"Sanitized relationship type: '{relationship_type}' -> '{sanitized}'")

    return sanitized


def sanitize_graph_data(data: Any) -> Any:
    """
    递归清理图数据中的关系类型。

    Args:
        data: 图数据（可以是字典、列表或其他类型）

    Returns:
        清理后的图数据
    """
    if isinstance(data, dict):
        # 处理字典
        result = {}
        for key, value in data.items():
            # 如果是关系类型相关的键
            if key in ['relationship', 'relation', 'rel_type', 'type', 'relationship_type']:
                if isinstance(value, str):
                    result[key] = sanitize_relationship_type(value)
                else:
                    result[key] = sanitize_graph_data(value)
            else:
                result[key] = sanitize_graph_data(value)
        return result

    elif isinstance(data, list):
        # 处理列表
        return [sanitize_graph_data(item) for item in data]

    elif isinstance(data, str):
        # 对于字符串，检查是否看起来像关系类型
        # 简单启发式：如果包含多个冒号，很可能是关系类型
        if data.count(':') > 1:
            return sanitize_relationship_type(data)
        return data

    else:
        # 其他类型直接返回
        return data


def patch_mem0_graph():
    """
    给 Mem0 的图存储功能打补丁，修复 Neo4j 5.x 兼容性问题。
    """
    try:
        from mem0.memory.graph_memory import GraphMemory

        # 保存原始的 add 方法
        original_add = GraphMemory.add

        def patched_add(self, data, filters=None):
            """修补后的 add 方法，会清理关系类型"""
            # 清理数据中的关系类型
            sanitized_data = sanitize_graph_data(data)

            # 调用原始方法
            return original_add(self, sanitized_data, filters)

        # 替换方法
        GraphMemory.add = patched_add
        logger.info("Successfully patched Mem0 GraphMemory.add() for Neo4j 5.x compatibility")

    except ImportError as e:
        logger.warning(f"Could not patch Mem0 GraphMemory: {e}")
    except Exception as e:
        logger.error(f"Error patching Mem0 GraphMemory: {e}")


def patch_neo4j_queries():
    """
    给 Neo4j 查询打补丁，在执行前清理 Cypher 查询中的关系类型。
    """
    try:
        from langchain_neo4j.graphs.neo4j_graph import Neo4jGraph

        # 保存原始的 query 方法
        original_query = Neo4jGraph.query

        def patched_query(self, query: str, params: Dict = None):
            """修补后的 query 方法，会清理 Cypher 查询中的关系类型"""
            # 使用正则表达式查找并替换关系类型中的冒号
            import re

            # 匹配 -[r:type]-> 或 -[:type]-> 模式
            def replace_relationship_type(match):
                full_match = match.group(0)
                rel_type = match.group(1)
                sanitized = sanitize_relationship_type(rel_type)
                return full_match.replace(rel_type, sanitized)

            # 查找所有关系类型并替换
            pattern = r'-\[(?:r)?:([^\]]+)\]->'
            sanitized_query = re.sub(pattern, replace_relationship_type, query)

            if sanitized_query != query:
                logger.debug(f"Sanitized Cypher query")

            # 调用原始方法
            return original_query(self, sanitized_query, params)

        # 替换方法
        Neo4jGraph.query = patched_query
        logger.info("Successfully patched Neo4jGraph.query() for Neo4j 5.x compatibility")

    except ImportError as e:
        logger.warning(f"Could not patch Neo4jGraph: {e}")
    except Exception as e:
        logger.error(f"Error patching Neo4jGraph: {e}")


def apply_all_patches():
    """应用所有补丁"""
    logger.info("Applying Neo4j 5.x compatibility patches...")
    patch_mem0_graph()
    patch_neo4j_queries()
    logger.info("Neo4j 5.x compatibility patches applied")
