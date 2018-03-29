import invariant from 'invariant';
import py from 'pinyin';

import { logRecorder } from './log';
import { seq, Repo, Icon, User, RepoVersion, ProjectVersion, Cache } from '../../model';
import { unique } from '../../helpers/utils';
import { iconStatus, startCode, endCode } from '../../constants/utils';
import { ICON_NAME, ICON_TAG } from '../../constants/validate';

// 处理类名生成
function getBaseClassName(icons, transaction) {
  let repoMap;
  const canUseCodes = [];
  const passIcons = [];
  const rejectIcons = [];
  const passed = [];
  const rejected = [];
  // 在事务里锁住 icon 库的更新
  return Repo
    .findAll({
      attributes: ['id', 'alias'],
      raw: true,
      lock: {
        level: transaction.LOCK.UPDATE,
        of: Icon,
      },
    })
    .then(repo => {
      repoMap = repo.reduce((p, n) => {
        const prev = p;
        prev[n.id] = n.alias;
        return prev;
      }, {});
      return Icon.findAll({
        attributes: ['code'],
        where: { status: { $in: [iconStatus.DISABLED, iconStatus.RESOLVED] } },
        order: 'code',
      });
    })
    .then((allIcons) => {
      const iconInfo = {};
      allIcons.forEach(icon => {
        const { code } = icon;
        iconInfo[`code${code}`] = code && true;
      });
      for (let i = parseInt(startCode, 10); i <= parseInt(endCode, 10); i++) {
        if (!iconInfo[`code${i}`]) {
          canUseCodes.push(i);
        }
      }
      icons.forEach(icon => {
        if (icon.passed) {
          passed.push(icon);
        } else {
          rejected.push(icon);
        }
      });
      // 将 逻辑删除（status：-1）、审核失败（status：5）的图标的 code 置为 null
      return Icon.update({
        code: null,
        applyTime: new Date,
      }, { where: {
        status: { $in: [iconStatus.DELETE, iconStatus.REJECTED] },
      }, transaction });
    })
    .then(() => {
      passed.forEach((icon, index) => {
        const pyName = py(icon.name, { style: py.STYLE_NORMAL })
          .reduce((prev, next) => prev.concat(next), [])
          .join('')
          .replace(/[^\w]/g, '');
        const code = canUseCodes[index];
        const hexCode = code.toString(16);
        const fontClass =
          `${repoMap[icon.repoId]}-${pyName}${hexCode}${icon.fontClass}`.toLowerCase();

        const temp = Icon.update(
          {
            code,
            fontClass,
            status: iconStatus.RESOLVED,
            applyTime: new Date,
          },
          { where: { id: icon.id }, transaction }
        );
        passIcons.push(temp);
      });
      return null;
    })
    .then(() => {
      rejected.forEach(icon => {
        const temp = Icon.update(
          {
            // fontClass,
            status: iconStatus.REJECTED,
            applyTime: new Date,
          },
          { where: { id: icon.id }, transaction }
        )
        // 如果审核未通过，需要移除 repoVersion 库中的关联
        .then(() => RepoVersion.destroy(
          {
            where: { repositoryId: icon.repoId, iconId: icon.id },
            transaction,
          }
        ));
        rejectIcons.push(temp);
      });
      return null;
    })
    .then(() => [].concat(passIcons, rejectIcons));
}

// 获取审核列表
export function* getAuditList(next) {
  const { repoList, model } = this.state.user;
  const whereMixin = {};

  if (model.actor === 1 && repoList && repoList.length) {
    whereMixin.where = { repositoryId: { $in: repoList } };
  } else {
    invariant(model.actor === 2, '您没有权限进行图标审核');
  }

  const auditData = yield Icon.findAll({
    where: { status: { $in: [iconStatus.PENDING, iconStatus.REPLACE] } },
    include: [{
      model: Repo,
      through: {
        model: RepoVersion,
        ...whereMixin,
      },
    }, User],
  }).then(icons => {
    const data = icons.map(i => {
      const icon = i.get({ plain: true });
      if (icon.repositories && icon.repositories.length) {
        icon.repo = icon.repositories[0];
        delete icon.repo.repoVersion;
        delete icon.repositories;
        return icon;
      }
      return null;
    });
    return data.filter(v => v);
  });

  this.state.respond = auditData.reduce((p, n) => p.concat(n), []);
  yield next;
}

// 审核直接上传的图标
function* auditUploadedIcon(uploadedIcons, userId, next) {
  /**
   * 图标审核入库流程
   * 1. 标记为 RESOLVED/REJECTED
   * 2. 生成不重复的 class-name
   * 3. 生成唯一 code
   */
  const t = yield seq.transaction(transaction =>
    getBaseClassName(uploadedIcons, transaction)
      // 更新图标内容
      .then(iconInfo => Promise.all(iconInfo))
      // 删除 cache 表中已审核过的（无论审核通过与否）图标的原始 svg 文件
      .then(() => {
        const iconIds = uploadedIcons.map(i => i.id);
        return Cache.destroy({
          where: { iconId: { $in: iconIds } },
          transaction,
        });
      })
      // 更新大库 updatedAt 字段
      .then(() => {
        const repoIds = unique(uploadedIcons.map(i => i.repoId));
        return Promise.all(repoIds.map(id =>
          Repo.update(
            { updatedAt: new Date },
            { where: { id }, transaction }
          )
        ));
      })
      .then(() => {
        const iconData = uploadedIcons.reduce((p, n) => {
          const prev = p;
          if (Array.isArray(p[n.repoId])) {
            prev[n.repoId].push(n);
          } else {
            prev[n.repoId] = [n];
          }
          return p;
        }, {});
        const log = [];
        Object.keys(iconData).forEach(repoId => {
          const auditOk = iconData[repoId].filter(i => i.passed);
          const auditFailed = iconData[repoId].filter(i => !i.passed);
          if (auditOk.length) {
            log.push({
              params: {
                icon: auditOk.map(i => ({ id: i.id, name: i.name })),
              },
              type: 'AUDIT_OK',
              loggerId: repoId,
              subscribers: unique(auditOk.map(i => i.uploader)),
            });
          }
          if (auditFailed.length) {
            log.push({
              params: {
                icon: auditFailed.map(i => ({ id: i.id, name: i.name })),
              },
              type: 'AUDIT_FAILED',
              loggerId: repoId,
              subscribers: unique(auditFailed.map(i => i.uploader)),
            });
          }
        });
        return logRecorder(log, transaction, userId);
      })
  );
  yield t;
  yield next;
}

// 审核非库管\超管的上传者替换上传的图标
function* auditReplacedIcon(replacedIcons, userId, next) {
  for (let i = 0, len = replacedIcons.length; i < len; i++) {
    const icon = replacedIcons[i];
    if (icon.passed) {
      const { name, tags } = icon;
      const fromId = icon.oldId;
      const toId = icon.id;
      // 要检验，to 必须是 REPLACE 状态，from 必须是 RESOLVED 状态
      const from = yield Icon.findOne({ where: { id: fromId } });
      const to = yield Icon.findOne({ where: { id: toId } });
      const repos = yield from.getRepositories();
      const userInfo = yield User.findOne({ where: { id: userId } });
      invariant(
        from.status === iconStatus.RESOLVED,
        `被替换的图标 ${from.name} 并非审核通过的线上图标`
      );
      invariant(
        to.status === iconStatus.REPLACE,
        `替换的新图标 ${to.name} 并非待审核状态的图标`
      );
      invariant(
        repos.length,
        `被替换的图标 ${from.name} 竟然不属于任何一个大库`
      );
      invariant(ICON_NAME.reg.test(name), ICON_NAME.message);
      invariant(ICON_TAG.reg.test(tags), ICON_TAG.message);

      const fromName = from.name;
      const toName = to.name;
      const { code, fontClass } = from;
      const { admin } = repos[0];
      const { actor } = userInfo;
      const repoVersion = yield RepoVersion.findOne({ where: { iconId: fromId } });

      invariant(
        userId === admin || actor === 2,
        '当前用户没有权限审核该图标，请对应库管或者超管进行替换审核'
      );

      yield seq.transaction(transaction =>
        to.update({
          name,
          fontClass,
          tags,
          code,
          oldId: fromId,
          applyTime: +new Date,
          status: iconStatus.RESOLVED,
        }, { transaction })
        .then(() => from.update({
          newId: toId, status: iconStatus.REPLACED,
        }, { transaction }))
        // 将替换审核通过的图标对应的 cache 中的 svg 删除
        .then(() => Cache.destroy({
          where: { iconId: toId },
          transaction,
        }))
        .then(() => repos[0].update({ updatedAt: new Date }, { transaction }))
        .then(() => RepoVersion.destroy({
          where: { repositoryId: icon.repoId, iconId: toId, version: 0 },
          transaction,
        }))
        .then(() => RepoVersion.update(
          { iconId: toId, version: '0.0.0' },
          { where: { version: 0, iconId: fromId }, transaction }
        ))
        .then(() => ProjectVersion.update(
          { iconId: toId, version: '0.0.0' },
          { where: { version: 0, iconId: fromId }, transaction }
        ))
        .then(() => {
          const log = {
            params: {
              iconFrom: { id: fromId, name: fromName },
              iconTo: { id: toId, name: toName },
            },
            type: 'REPLACE',
            loggerId: repoVersion.repositoryId,
          };
          return logRecorder(log, transaction, userId);
        })
        .then(() => {
          const auditSuccessLog = {
            params: {
              icon: [{ id: icon.id, name: icon.name }],
            },
            type: 'AUDIT_OK',
            loggerId: icon.repoId,
            subscribers: [icon.uploader],
          };
          return logRecorder(auditSuccessLog, transaction, userId);
        })
      );
    } else {
      yield seq.transaction(transaction =>
        RepoVersion.destroy({
          where: { repositoryId: icon.repoId, iconId: icon.id },
          transaction,
        })
        .then(() => Icon.update({
          status: iconStatus.REJECTED,
        }, {
          where: { status: iconStatus.REPLACE, id: icon.id },
          transaction,
        }))
        // 将替换审核不通过的图标对应的 cache 中的 svg 删除
        .then(() => Cache.destroy({
          where: { iconId: icon.id },
          transaction,
        }))
        .then(() => {
          const auditFailLog = {
            params: {
              icon: [{ id: icon.id, name: icon.name }],
            },
            type: 'AUDIT_FAILED',
            loggerId: icon.repoId,
            subscribers: [icon.uploader],
          };
          return logRecorder(auditFailLog, transaction, userId);
        })
      );
    }
  }
  yield next;
}

// 审核某图标入库
export function* auditIcons(next) {
  const { icons } = this.param;
  const { userId } = this.state.user;
  // 预处理，防止有不传 id 的情况
  // 针对直接上传和替换上传的图标进行区分
  const replacedIcons = [];
  const uploadedIcons = [];
  icons.forEach(icon => {
    invariant(
      !isNaN(icon.id),
      `icons 数组期望传入合法 id，目前传入的是 ${icon.id}`
    );
    invariant(
      typeof icon.passed === 'boolean',
      `icon.passed 期望传入布尔值，目前传入的是 ${typeof icon.passed}`
    );
    invariant(
      !isNaN(icon.repoId),
      `icons 数组期望传入合法大库 id，目前传入的是 ${icon.repoId}`
    );
    invariant(
      !isNaN(icon.uploader),
      `icons 数组期望传入合法大库上传者，目前传入的是 ${icon.uploader}`
    );
    if (icon.code && icon.oldId) {
      replacedIcons.push(icon);
    } else {
      uploadedIcons.push(icon);
    }
  });

  if (uploadedIcons.length) {
    yield auditUploadedIcon(uploadedIcons, userId, next);
  }
  if (replacedIcons.length) {
    yield auditReplacedIcon(replacedIcons, userId, next);
  }
  yield next;
}
